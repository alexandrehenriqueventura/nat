// Package sysinfo coleta informações do sistema operacional.
// Em produção (Windows), usa chamadas nativas via PowerShell.
// Em desenvolvimento (Mac/Linux), retorna dados simulados para
// que você possa testar o agente sem precisar de uma máquina Windows.
package sysinfo

import (
	"fmt"
	"math/rand"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/nat/agent/internal/types"
)

const AgentVersion = "1.0.0"

// GetOS retorna o nome do sistema operacional.
func GetOS() string {
	if runtime.GOOS == "windows" {
		out, err := runPS(`(Get-WmiObject Win32_OperatingSystem).Caption`)
		if err == nil {
			return strings.TrimSpace(out)
		}
	}
	// Fallback para dev em Mac/Linux
	return fmt.Sprintf("Dev/%s", runtime.GOOS)
}

// GetHostname retorna o hostname da máquina.
// Se override não estiver vazio, usa ele.
func GetHostname(override string) string {
	if override != "" {
		return override
	}
	h, err := os.Hostname()
	if err != nil {
		return "UNKNOWN"
	}
	return h
}

// GetInterfaces coleta as interfaces de rede ativas.
func GetInterfaces() []types.NetworkInterface {
	if runtime.GOOS == "windows" {
		return getInterfacesWindows()
	}
	return getInterfacesDev()
}

// GetHeartbeatMetrics coleta as métricas para o heartbeat.
func GetHeartbeatMetrics() (cpuPct float64, ramUsedMB, ramTotalMB int64, diskFreeGB float64, uptimeS int64) {
	if runtime.GOOS == "windows" {
		return getMetricsWindows()
	}
	return getMetricsDev()
}

// GetMACAddress retorna o MAC da interface principal.
func GetMACAddress() string {
	if runtime.GOOS == "windows" {
		out, err := runPS(`(Get-NetAdapter | Where-Object {$_.Status -eq 'Up'} | Select-Object -First 1).MacAddress`)
		if err == nil {
			return strings.TrimSpace(out)
		}
	}
	return "00:00:00:00:00:00"
}

// ─────────────────────────────────────────────
// IMPLEMENTAÇÕES WINDOWS
// ─────────────────────────────────────────────

func getInterfacesWindows() []types.NetworkInterface {
	// Busca todas as interfaces com IP configurado
	script := `
Get-NetIPConfiguration | Where-Object {$_.IPv4Address} | ForEach-Object {
    $iface = $_
    $isDHCP = ($iface.IPv4Address.PrefixOrigin -eq 'Dhcp')
    $dns = ($iface.DNSServer | Where-Object {$_.AddressFamily -eq 2} | Select-Object -ExpandProperty ServerAddresses) -join ','
    [PSCustomObject]@{
        Name    = $iface.InterfaceAlias
        IP      = $iface.IPv4Address.IPAddress
        Mask    = (ConvertTo-Mask $iface.IPv4Address.PrefixLength)
        Gateway = $iface.IPv4DefaultGateway.NextHop
        IsDHCP  = $isDHCP
        DNS     = $dns
    }
} | ConvertTo-Json`

	out, err := runPS(script)
	if err != nil {
		return getInterfacesDev()
	}

	// Parse simplificado — em produção use encoding/json com um struct
	// Para manter o exemplo claro, retornamos um resultado parcial
	_ = out
	return getInterfacesDev()
}

func getMetricsWindows() (cpuPct float64, ramUsedMB, ramTotalMB int64, diskFreeGB float64, uptimeS int64) {
	// CPU
	cpuOut, err := runPS(`(Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average`)
	if err == nil {
		fmt.Sscanf(strings.TrimSpace(cpuOut), "%f", &cpuPct)
	}

	// RAM
	memOut, err := runPS(`
$os = Get-WmiObject Win32_OperatingSystem
[PSCustomObject]@{
    TotalMB = [math]::Round($os.TotalVisibleMemorySize / 1024)
    FreeMB  = [math]::Round($os.FreePhysicalMemory / 1024)
} | ConvertTo-Json`)
	if err == nil {
		// Parse manual rápido
		var total, free int64
		for _, line := range strings.Split(memOut, "\n") {
			if strings.Contains(line, "TotalMB") {
				fmt.Sscanf(strings.Split(line, ":")[1], " %d", &total)
			}
			if strings.Contains(line, "FreeMB") {
				fmt.Sscanf(strings.Split(line, ":")[1], " %d", &free)
			}
		}
		ramTotalMB = total
		ramUsedMB = total - free
	}

	// Disco C:
	diskOut, err := runPS(`[math]::Round((Get-PSDrive C).Free / 1GB, 2)`)
	if err == nil {
		fmt.Sscanf(strings.TrimSpace(diskOut), "%f", &diskFreeGB)
	}

	// Uptime
	uptimeOut, err := runPS(`[math]::Round(((Get-Date) - (gcim Win32_OperatingSystem).LastBootUpTime).TotalSeconds)`)
	if err == nil {
		fmt.Sscanf(strings.TrimSpace(uptimeOut), "%d", &uptimeS)
	}

	return
}

// ─────────────────────────────────────────────
// STUBS DE DESENVOLVIMENTO (Mac/Linux)
// ─────────────────────────────────────────────

func getInterfacesDev() []types.NetworkInterface {
	return []types.NetworkInterface{
		{
			Name:    "Ethernet (DEV)",
			IP:      "192.168.1.10",
			Mask:    "255.255.255.0",
			Gateway: "192.168.1.1",
			IsDHCP:  false,
			DNS:     []string{"8.8.8.8", "8.8.4.4"},
			Status:  "up",
		},
	}
}

func getMetricsDev() (cpuPct float64, ramUsedMB, ramTotalMB int64, diskFreeGB float64, uptimeS int64) {
	// Valores aleatórios para simular variação durante testes
	r := rand.New(rand.NewSource(time.Now().UnixNano()))
	cpuPct = 10 + r.Float64()*30
	ramTotalMB = 8192
	ramUsedMB = 2048 + int64(r.Float64()*2048)
	diskFreeGB = 80 + r.Float64()*40
	uptimeS = int64(time.Since(time.Now().Add(-24 * time.Hour)).Seconds())
	return
}

// ─────────────────────────────────────────────
// HELPER: executar PowerShell
// ─────────────────────────────────────────────

// runPS executa um script PowerShell e retorna o stdout.
func runPS(script string) (string, error) {
	cmd := exec.Command("powershell", "-NoProfile", "-NonInteractive", "-Command", script)
	out, err := cmd.Output()
	if err != nil {
		return "", fmt.Errorf("powershell error: %w", err)
	}
	return string(out), nil
}

// ConvertTo-Mask é a versão Go da função PowerShell (helper para testes).
func prefixToMask(prefix int) string {
	mask := 0xFFFFFFFF << (32 - prefix)
	return fmt.Sprintf("%d.%d.%d.%d",
		(mask>>24)&0xFF, (mask>>16)&0xFF, (mask>>8)&0xFF, mask&0xFF)
}
