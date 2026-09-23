## Como instalar Go e rodar o agente

### 1. Instalar Go (Mac)
```bash
brew install go
```

### 2. Instalar dependências do projeto
```bash
cd "/Users/alexandrehventura/Desktop/IA projetos/nat/agent"
go mod tidy
```

### 3. Rodar em desenvolvimento (Mac/Linux — sem Windows)
```bash
go run ./cmd/main.go
```

### 4. Compilar para Windows (cross-compile do Mac)
```bash
GOOS=windows GOARCH=amd64 go build -ldflags="-s -w" -o nat-agent.exe ./cmd/
```

O arquivo `nat-agent.exe` gerado é distribuído junto com o `config.json`
e instalado como serviço Windows via `sc create` ou NSSM.
