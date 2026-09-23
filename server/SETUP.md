# NAT Central Server — Guia de Execução e Teste

## 1. Instalação do Go (se ainda não tiver)

No macOS:
```bash
brew install go
```

## 2. Baixar dependências

Dentro da pasta `server/`:
```bash
cd "/Users/alexandrehventura/Desktop/IA projetos/nat/server"
go mod tidy
```

## 3. Iniciar o Servidor

```bash
go run cmd/main.go -config config.json
```

O servidor iniciará ouvindo em `http://localhost:8080`.

## 4. Endpoints Disponíveis

- **SSE (Realtime frontend)**: `GET /events/devices`
- **Agentes WebSocket**: `WS /ws/agent?token=TROQUE_PELO_TOKEN_SECRETO`
- **Listar Dispositivos**: `GET /api/devices`
- **Comandos no Terminal**: `POST /api/devices/:id/command`
- **Empresas**: `GET /api/companies`, `POST /api/companies`, `PATCH /api/companies/:id`, `DELETE /api/companies/:id`
- **Health check**: `GET /healthz`

## 5. Conectando o Frontend ao Servidor Real

No arquivo `frontend/src/lib/api.ts`:
1. Mude `const USE_MOCK = true` para `const USE_MOCK = false`.
2. Como o Vite já está com proxy configurado para `http://localhost:8080`, todas as requisições irão direto para o Servidor Central Go.
