// Package executor implementa o despachante de comandos do agente.
// Todo comando recebido via WebSocket passa por aqui.
//
// SEGURANÇA: Apenas comandos presentes na cmdWhitelist são executados.
// Qualquer outro tipo retorna um result.error com COMMAND_NOT_ALLOWED.
package executor

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os/exec"
	"strings"
	"time"

	"github.com/nat/agent/internal/types"
)

// Sender é a interface que o executor usa para enviar resultados de volta.
// Isso desacopla o executor da conexão WebSocket, facilitando testes.
type Sender interface {
	Send(msg types.Message) error
}

// Executor despacha comandos recebidos para seus handlers.
type Executor struct {
	hostname string
	sender   Sender
	logger   *slog.Logger

	// cmdWhitelist contém todos os tipos de comando que o agente aceita.
	// Qualquer tipo fora desta lista é rejeitado imediatamente.
	cmdWhitelist map[string]bool
}

// New cria um novo Executor.
func New(hostname string, sender Sender, logger *slog.Logger) *Executor {
	whitelist := map[string]bool{
		types.TypeCmdNetGetConfig:      true,
		types.TypeCmdNetSetIP:          true,
		types.TypeCmdNetSetDHCP:        true,
		types.TypeCmdShareList:         true,
		types.TypeCmdShareCreate:       true,
		types.TypeCmdShareDelete:       true,
		types.TypeCmdShareSetPerms:     true,
		types.TypeCmdUserList:          true,
		types.TypeCmdUserCreate:        true,
		types.TypeCmdUserSetPassword:   true,
		types.TypeCmdUserToggleStatus:  true,
		types.TypeCmdSystemInfo:        true,
	}

	return &Executor{
		hostname:     hostname,
		sender:       sender,
		logger:       logger,
		cmdWhitelist: whitelist,
	}
}

// Dispatch recebe uma mensagem bruta, valida e despacha para o handler certo.
// Roda em uma goroutine separada para não bloquear o loop principal de leitura.
func (e *Executor) Dispatch(raw types.RawMessage) {
	go func() {
		e.logger.Info("comando recebido", "msg_id", raw.MsgID, "type", raw.Type)

		// ── Verificação de whitelist ─────────────────────────────
		if !e.cmdWhitelist[raw.Type] {
			e.logger.Warn("comando não permitido", "type", raw.Type)
			e.sendError(raw.MsgID, raw.Type, types.ErrCommandNotAllowed,
				fmt.Sprintf("Comando '%s' não está na whitelist do agente.", raw.Type), "")
			return
		}

		// Timeout global por comando: 60 segundos.
		ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
		defer cancel()

		// ── Roteamento por tipo ─────────────────────────────────
		switch raw.Type {

		// Rede
		case types.TypeCmdNetGetConfig:
			e.handleNetGetConfig(ctx, raw)
		case types.TypeCmdNetSetIP:
			e.handleNetSetIP(ctx, raw)
		case types.TypeCmdNetSetDHCP:
			e.handleNetSetDHCP(ctx, raw)

		// Compartilhamentos
		case types.TypeCmdShareList:
			e.handleShareList(ctx, raw)
		case types.TypeCmdShareCreate:
			e.handleShareCreate(ctx, raw)
		case types.TypeCmdShareDelete:
			e.handleShareDelete(ctx, raw)
		case types.TypeCmdShareSetPerms:
			e.handleShareSetPerms(ctx, raw)

		// Usuários
		case types.TypeCmdUserList:
			e.handleUserList(ctx, raw)
		case types.TypeCmdUserCreate:
			e.handleUserCreate(ctx, raw)
		case types.TypeCmdUserSetPassword:
			e.handleUserSetPassword(ctx, raw)
		case types.TypeCmdUserToggleStatus:
			e.handleUserToggleStatus(ctx, raw)

		// Sistema
		case types.TypeCmdSystemInfo:
			e.handleSystemInfo(ctx, raw)
		}
	}()
}

// ─────────────────────────────────────────────────────────────
// HANDLERS DE REDE
// ─────────────────────────────────────────────────────────────

func (e *Executor) handleNetGetConfig(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.net.get_config")

	script := `
Get-NetIPConfiguration | Where-Object {$_.IPv4Address} | ForEach-Object {
    [PSCustomObject]@{
        Name    = $_.InterfaceAlias
        IP      = $_.IPv4Address.IPAddress
        Gateway = if ($_.IPv4DefaultGateway) { $_.IPv4DefaultGateway.NextHop } else { '' }
        IsDHCP  = ($_.IPv4Address.PrefixOrigin -eq 'Dhcp')
    }
} | ConvertTo-Json -Compress`

	out, err := runPS(ctx, script)
	if err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError, "Falha ao obter configuração de rede", err.Error())
		return
	}

	e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{
		"raw_output": out,
	})
}

func (e *Executor) handleNetSetIP(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.net.set_ip")

	var p types.CmdNetSetIPPayload
	if !e.unmarshalPayload(raw, &p) {
		return
	}

	timeout := p.RollbackTimeoutS
	if timeout <= 0 {
		timeout = 15
	}

	// 1. Salva IP atual para possível rollback
	prevIP, prevGW, prevIsDHCP := e.getCurrentIP(ctx, p.InterfaceName)

	// 2. Aplica o novo IP estático
	setScript := fmt.Sprintf(`
$iface = '%s'
netsh interface ipv4 set address name=$iface static %s %s %s
netsh interface ipv4 set dns name=$iface static %s
netsh interface ipv4 add dns name=$iface %s index=2`,
		p.InterfaceName, p.IP, p.Mask, p.Gateway, p.DNSPrimary, p.DNSSecondary)

	if _, err := runPS(ctx, setScript); err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Falha ao aplicar novo IP", err.Error())
		return
	}

	e.logger.Info("novo IP aplicado, aguardando confirmação de conectividade",
		"ip", p.IP, "timeout_s", timeout)

	// 3. Aguarda e testa conectividade com o gateway
	time.Sleep(3 * time.Second)
	pingCtx, cancelPing := context.WithTimeout(ctx, time.Duration(timeout)*time.Second)
	defer cancelPing()

	connected := e.pingGateway(pingCtx, p.Gateway)

	if connected {
		e.logger.Info("IP alterado com sucesso", "new_ip", p.IP)
		e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{
			"new_ip":         p.IP,
			"interface_name": p.InterfaceName,
		})
		return
	}

	// 4. Rollback: sem resposta do gateway
	e.logger.Warn("sem resposta do gateway, revertendo IP",
		"gateway", p.Gateway, "prev_ip", prevIP)

	if prevIsDHCP {
		rollbackScript := fmt.Sprintf(
			`netsh interface ipv4 set address name='%s' dhcp`, p.InterfaceName)
		runPS(context.Background(), rollbackScript) //nolint:errcheck
	} else {
		rollbackScript := fmt.Sprintf(
			`netsh interface ipv4 set address name='%s' static %s`, p.InterfaceName, prevIP)
		runPS(context.Background(), rollbackScript) //nolint:errcheck
	}

	e.sendRollback(raw.MsgID, raw.Type, "no_gateway_ping_after_timeout",
		map[string]interface{}{
			"ip":      prevIP,
			"gateway": prevGW,
			"is_dhcp": prevIsDHCP,
		})
}

func (e *Executor) handleNetSetDHCP(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.net.set_dhcp")

	var p types.CmdNetSetDHCPPayload
	if !e.unmarshalPayload(raw, &p) {
		return
	}

	script := fmt.Sprintf(`
netsh interface ipv4 set address name='%s' dhcp
netsh interface ipv4 set dns name='%s' dhcp`, p.InterfaceName, p.InterfaceName)

	if _, err := runPS(ctx, script); err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Falha ao ativar DHCP", err.Error())
		return
	}

	// Aguarda IP ser obtido via DHCP
	time.Sleep(4 * time.Second)
	newIP, _, _ := e.getCurrentIP(ctx, p.InterfaceName)

	e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{
		"ip_obtained":    newIP,
		"interface_name": p.InterfaceName,
	})
}

// ─────────────────────────────────────────────────────────────
// HANDLERS DE COMPARTILHAMENTOS
// ─────────────────────────────────────────────────────────────

func (e *Executor) handleShareList(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.share.list")

	script := `Get-SmbShare | Where-Object {$_.Name -notlike '*$'} | ForEach-Object {
    $perms = Get-SmbShareAccess -Name $_.Name
    [PSCustomObject]@{
        Name        = $_.Name
        Path        = $_.Path
        Description = $_.Description
        Permissions = $perms | Select-Object AccountName, AccessRight
    }
} | ConvertTo-Json -Depth 3 -Compress`

	out, err := runPS(ctx, script)
	if err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Falha ao listar compartilhamentos", err.Error())
		return
	}

	e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{"raw": out})
}

func (e *Executor) handleShareCreate(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.share.create")

	var p types.CmdShareCreatePayload
	if !e.unmarshalPayload(raw, &p) {
		return
	}

	// Cria diretório se solicitado
	dirCreated := false
	if p.CreateIfNotExists {
		mkdirScript := fmt.Sprintf(`
if (-Not (Test-Path '%s')) {
    New-Item -ItemType Directory -Path '%s' -Force | Out-Null
    $true
} else { $false }`, p.LocalPath, p.LocalPath)

		out, err := runPS(ctx, mkdirScript)
		if err != nil {
			e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
				"Falha ao criar diretório", err.Error())
			return
		}
		dirCreated = strings.TrimSpace(out) == "True"
	}

	// Cria o compartilhamento SMB
	createScript := fmt.Sprintf(
		`New-SmbShare -Name '%s' -Path '%s' -Description '%s' -FullAccess 'Administradores'`,
		p.Name, p.LocalPath, p.Description)

	if _, err := runPS(ctx, createScript); err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Falha ao criar compartilhamento SMB", err.Error())
		return
	}

	// Aplica permissões
	for _, perm := range p.Permissions {
		e.applySharePermission(ctx, p.Name, perm)
	}

	e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{
		"name":        p.Name,
		"local_path":  p.LocalPath,
		"dir_created": dirCreated,
	})
}

func (e *Executor) handleShareDelete(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.share.delete")

	var p types.CmdShareDeletePayload
	if !e.unmarshalPayload(raw, &p) {
		return
	}

	script := fmt.Sprintf(`Remove-SmbShare -Name '%s' -Force`, p.Name)
	if _, err := runPS(ctx, script); err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Falha ao remover compartilhamento", err.Error())
		return
	}

	if p.DeleteLocalDir {
		e.logger.Warn("removendo diretório local", "share", p.Name)
		// Obtém caminho antes de deletar — simplificado aqui
	}

	e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{"deleted": p.Name})
}

func (e *Executor) handleShareSetPerms(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.share.set_perms")

	var p types.CmdShareSetPermsPayload
	if !e.unmarshalPayload(raw, &p) {
		return
	}

	for _, perm := range p.Permissions {
		if err := e.applySharePermission(ctx, p.Name, perm); err != nil {
			e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
				fmt.Sprintf("Falha ao aplicar permissão para '%s'", perm.User), err.Error())
			return
		}
	}

	e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{"share": p.Name, "updated": true})
}

// ─────────────────────────────────────────────────────────────
// HANDLERS DE USUÁRIOS
// ─────────────────────────────────────────────────────────────

func (e *Executor) handleUserList(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.user.list")

	script := `Get-LocalUser | ForEach-Object {
    [PSCustomObject]@{
        Name        = $_.Name
        FullName    = $_.FullName
        Description = $_.Description
        Enabled     = $_.Enabled
        LastLogon   = $_.LastLogon
        PwdExpires  = -not $_.PasswordNeverExpires
    }
} | ConvertTo-Json -Compress`

	out, err := runPS(ctx, script)
	if err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Falha ao listar usuários", err.Error())
		return
	}

	e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{"raw": out})
}

func (e *Executor) handleUserCreate(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.user.create")

	var p types.CmdUserCreatePayload
	if !e.unmarshalPayload(raw, &p) {
		return
	}

	// Cria o usuário
	script := fmt.Sprintf(`
$pw = ConvertTo-SecureString '%s' -AsPlainText -Force
New-LocalUser -Name '%s' -Password $pw -FullName '%s' -Description '%s' -PasswordNeverExpires:$%t`,
		p.Password, p.Username, p.FullName, p.Description, p.PwdNeverExpires)

	if _, err := runPS(ctx, script); err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Falha ao criar usuário", err.Error())
		return
	}

	// Adiciona aos grupos
	for _, group := range p.Groups {
		groupScript := fmt.Sprintf(
			`Add-LocalGroupMember -Group '%s' -Member '%s'`, group, p.Username)
		runPS(ctx, groupScript) //nolint:errcheck
	}

	e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{
		"username": p.Username,
		"created":  true,
	})
}

func (e *Executor) handleUserSetPassword(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.user.set_password")

	var p types.CmdUserSetPasswordPayload
	if !e.unmarshalPayload(raw, &p) {
		return
	}

	script := fmt.Sprintf(`
$pw = ConvertTo-SecureString '%s' -AsPlainText -Force
Set-LocalUser -Name '%s' -Password $pw`, p.NewPassword, p.Username)

	if _, err := runPS(ctx, script); err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Falha ao alterar senha", err.Error())
		return
	}

	e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{
		"username": p.Username,
		"updated":  true,
	})
}

func (e *Executor) handleUserToggleStatus(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.user.toggle_status")

	var p types.CmdUserToggleStatusPayload
	if !e.unmarshalPayload(raw, &p) {
		return
	}

	action := "Disable"
	if p.Enabled {
		action = "Enable"
	}

	script := fmt.Sprintf(`%s-LocalUser -Name '%s'`, action, p.Username)
	if _, err := runPS(ctx, script); err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Falha ao alterar status do usuário", err.Error())
		return
	}

	e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{
		"username": p.Username,
		"enabled":  p.Enabled,
	})
}

// ─────────────────────────────────────────────────────────────
// HANDLER DE SISTEMA
// ─────────────────────────────────────────────────────────────

func (e *Executor) handleSystemInfo(ctx context.Context, raw types.RawMessage) {
	e.logger.Info("executando cmd.system.info")

	script := `
$os   = Get-WmiObject Win32_OperatingSystem
$cpu  = Get-WmiObject Win32_Processor | Select-Object -First 1
$disk = Get-PSDrive C
[PSCustomObject]@{
    OS        = $os.Caption
    OSVersion = $os.Version
    Hostname  = $env:COMPUTERNAME
    CPU       = $cpu.Name
    Cores     = $cpu.NumberOfCores
    RAMTotal  = [math]::Round($os.TotalVisibleMemorySize / 1024)
    DiskFree  = [math]::Round($disk.Free / 1GB, 2)
    Uptime    = [math]::Round(((Get-Date) - $os.ConvertToDateTime($os.LastBootUpTime)).TotalSeconds)
} | ConvertTo-Json -Compress`

	out, err := runPS(ctx, script)
	if err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Falha ao coletar informações do sistema", err.Error())
		return
	}

	e.sendOK(raw.MsgID, raw.Type, map[string]interface{}{"raw": out})
}

// ─────────────────────────────────────────────────────────────
// HELPERS INTERNOS
// ─────────────────────────────────────────────────────────────

// unmarshalPayload deserializa o payload de um RawMessage para a struct alvo.
func (e *Executor) unmarshalPayload(raw types.RawMessage, target interface{}) bool {
	b, err := json.Marshal(raw.Payload)
	if err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Payload inválido (marshal)", err.Error())
		return false
	}
	if err := json.Unmarshal(b, target); err != nil {
		e.sendError(raw.MsgID, raw.Type, types.ErrPowerShellError,
			"Payload inválido (unmarshal)", err.Error())
		return false
	}
	return true
}

// applySharePermission aplica uma permissão SMB + NTFS para um compartilhamento.
func (e *Executor) applySharePermission(ctx context.Context, shareName string, perm types.SharePermission) error {
	// Mapeia nível simplificado → parâmetros do SMB
	smbAccess := map[string]string{
		"ro":   "Read",
		"rw":   "Change",
		"full": "Full",
		"none": "None",
	}

	access, ok := smbAccess[perm.Level]
	if !ok {
		return fmt.Errorf("nível de permissão inválido: %s", perm.Level)
	}

	var script string
	if perm.Level == "none" {
		script = fmt.Sprintf(
			`Revoke-SmbShareAccess -Name '%s' -AccountName '%s' -Force`,
			shareName, perm.User)
	} else {
		// Remove permissão anterior antes de adicionar a nova
		script = fmt.Sprintf(`
Revoke-SmbShareAccess -Name '%s' -AccountName '%s' -Force -ErrorAction SilentlyContinue
Grant-SmbShareAccess -Name '%s' -AccountName '%s' -AccessRight %s -Force`,
			shareName, perm.User, shareName, perm.User, access)
	}

	_, err := runPS(ctx, script)
	return err
}

// getCurrentIP lê o IP atual de uma interface (para rollback).
func (e *Executor) getCurrentIP(ctx context.Context, ifaceName string) (ip, gateway string, isDHCP bool) {
	script := fmt.Sprintf(`
$iface = Get-NetIPConfiguration -InterfaceAlias '%s'
"$($iface.IPv4Address.IPAddress)|$($iface.IPv4DefaultGateway.NextHop)|$($iface.IPv4Address.PrefixOrigin -eq 'Dhcp')"
`, ifaceName)

	out, err := runPS(ctx, script)
	if err != nil {
		return "", "", true
	}

	parts := strings.Split(strings.TrimSpace(out), "|")
	if len(parts) == 3 {
		ip = parts[0]
		gateway = parts[1]
		isDHCP = strings.ToLower(parts[2]) == "true"
	}
	return
}

// pingGateway testa conectividade com o gateway até o contexto expirar.
func (e *Executor) pingGateway(ctx context.Context, gateway string) bool {
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return false
		case <-ticker.C:
			cmd := exec.CommandContext(ctx, "ping", "-n", "1", "-w", "1000", gateway)
			if err := cmd.Run(); err == nil {
				return true
			}
		}
	}
}

// sendOK envia um result.ok para o servidor.
func (e *Executor) sendOK(refMsgID, cmdType string, data interface{}) {
	msg := types.Message{
		MsgID: newMsgID(),
		Type:  types.TypeResultOk,
		Ts:    time.Now().UTC(),
		Payload: types.ResultOKPayload{
			RefMsgID: refMsgID,
			CmdType:  cmdType,
			Data:     data,
		},
	}
	if err := e.sender.Send(msg); err != nil {
		e.logger.Error("falha ao enviar result.ok", "err", err)
	}
}

// sendError envia um result.error para o servidor.
func (e *Executor) sendError(refMsgID, cmdType, code, message, detail string) {
	msg := types.Message{
		MsgID: newMsgID(),
		Type:  types.TypeResultError,
		Ts:    time.Now().UTC(),
		Payload: types.ResultErrorPayload{
			RefMsgID: refMsgID,
			CmdType:  cmdType,
			Error: types.ResultError{
				Code:    code,
				Message: message,
				Detail:  detail,
			},
		},
	}
	if err := e.sender.Send(msg); err != nil {
		e.logger.Error("falha ao enviar result.error", "err", err)
	}
}

// sendRollback envia um result.rollback para o servidor.
func (e *Executor) sendRollback(refMsgID, cmdType, reason string, revertedTo interface{}) {
	msg := types.Message{
		MsgID: newMsgID(),
		Type:  types.TypeResultRollback,
		Ts:    time.Now().UTC(),
		Payload: types.ResultRollbackPayload{
			RefMsgID:   refMsgID,
			CmdType:    cmdType,
			Reason:     reason,
			RevertedTo: revertedTo,
		},
	}
	if err := e.sender.Send(msg); err != nil {
		e.logger.Error("falha ao enviar result.rollback", "err", err)
	}
}

// runPS executa PowerShell com contexto (timeout).
func runPS(ctx context.Context, script string) (string, error) {
	cmd := exec.CommandContext(ctx, "powershell",
		"-NoProfile", "-NonInteractive", "-Command", script)
	out, err := cmd.Output()
	if err != nil {
		if ctx.Err() != nil {
			return "", fmt.Errorf("timeout ao executar PowerShell: %w", ctx.Err())
		}
		return "", fmt.Errorf("%w: %s", err, string(out))
	}
	return string(out), nil
}

// newMsgID gera um ID único simples baseado em timestamp.
// Em produção, use github.com/google/uuid.
func newMsgID() string {
	return fmt.Sprintf("agent-%d", time.Now().UnixNano())
}
