package hub

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/nat/server/internal/db"
	"github.com/nat/server/internal/types"
)

const (
	writeWait      = 10 * time.Second
	pongWait       = 60 * time.Second
	pingPeriod     = (pongWait * 9) / 10
	maxMessageSize = 1 << 20 // 1 MB
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	// Aceita qualquer origem — restrinja em produção usando CheckOrigin
	CheckOrigin: func(r *http.Request) bool { return true },
}

// Client representa a conexão WebSocket de um agente.
type Client struct {
	hub      *Hub
	conn     *websocket.Conn
	send     chan []byte
	DeviceID string
	logger   *slog.Logger
}

// ServeWS faz o upgrade da conexão HTTP para WebSocket e registra o agente.
// Valida o token do agente antes de aceitar a conexão.
func ServeWS(
	hub *Hub,
	database *db.DB,
	agentToken string,
	logger *slog.Logger,
	w http.ResponseWriter,
	r *http.Request,
) {
	// Validação de token (query param ?token=...)
	if r.URL.Query().Get("token") != agentToken {
		http.Error(w, "token inválido", http.StatusUnauthorized)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		logger.Error("upgrade websocket falhou", "err", err)
		return
	}

	client := &Client{
		hub:    hub,
		conn:   conn,
		send:   make(chan []byte, 64),
		logger: logger,
	}

	// Aguarda a mensagem agent.register para saber o deviceID
	conn.SetReadLimit(maxMessageSize)
	conn.SetReadDeadline(time.Now().Add(30 * time.Second))

	_, msgBytes, err := conn.ReadMessage()
	if err != nil {
		logger.Warn("primeiro frame inválido", "err", err)
		conn.Close()
		return
	}

	var raw types.RawMessage
	if err := json.Unmarshal(msgBytes, &raw); err != nil || raw.Type != types.TypeAgentRegister {
		logger.Warn("primeiro frame não é agent.register", "type", raw.Type)
		conn.Close()
		return
	}

	// Desserializa o payload de registro
	data, _ := json.Marshal(raw.Payload)
	var regPayload types.RegisterPayload
	if err := json.Unmarshal(data, &regPayload); err != nil {
		logger.Warn("payload de registro inválido", "err", err)
		conn.Close()
		return
	}

	// Upsert no banco
	device, err := database.Devices.Upsert(regPayload)
	if err != nil {
		logger.Error("upsert do device", "err", err)
		conn.Close()
		return
	}

	client.DeviceID = device.ID

	// Envia o ack de registro
	ack := types.Message{
		MsgID: raw.MsgID + ".ack",
		Type:  types.TypeAgentRegisterAck,
		Ts:    time.Now().UTC(),
		Payload: types.RegisterAckPayload{
			AgentID:            device.ID,
			HeartbeatIntervalS: 10,
			Message:            "bem-vindo ao NAT Server",
		},
	}
	ackBytes, _ := json.Marshal(ack)
	if err := conn.WriteMessage(websocket.TextMessage, ackBytes); err != nil {
		conn.Close()
		return
	}

	// Remove o deadline agora que o registro está feito
	conn.SetReadDeadline(time.Time{})

	// Registra no hub e inicia goroutines
	hub.RegisterClient(client)
	go client.writePump()
	client.readPump() // bloqueia até a conexão fechar
}

// readPump lê mensagens do agente e as despacha para o hub.
func (c *Client) readPump() {
	defer func() {
		c.hub.UnregisterClient(c)
		c.conn.Close()
	}()

	c.conn.SetReadLimit(maxMessageSize)
	c.conn.SetReadDeadline(time.Now().Add(pongWait))
	c.conn.SetPongHandler(func(string) error {
		c.conn.SetReadDeadline(time.Now().Add(pongWait))
		return nil
	})

	for {
		_, msgBytes, err := c.conn.ReadMessage()
		if err != nil {
			if websocket.IsUnexpectedCloseError(err,
				websocket.CloseGoingAway, websocket.CloseAbnormalClosure) {
				c.logger.Warn("leitura inesperada", "device_id", c.DeviceID, "err", err)
			}
			return
		}

		var raw types.RawMessage
		if err := json.Unmarshal(msgBytes, &raw); err != nil {
			c.logger.Warn("JSON inválido do agente", "device_id", c.DeviceID, "err", err)
			continue
		}

		c.hub.HandleAgentMessage(c.DeviceID, raw)
	}
}

// writePump escreve mensagens do canal send para o WebSocket.
func (c *Client) writePump() {
	ticker := time.NewTicker(pingPeriod)
	defer func() {
		ticker.Stop()
		c.conn.Close()
	}()

	for {
		select {
		case msg, ok := <-c.send:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if !ok {
				// Hub fechou o canal
				c.conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}
			if err := c.conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}

		case <-ticker.C:
			c.conn.SetWriteDeadline(time.Now().Add(writeWait))
			if err := c.conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
