# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

# Instala dependências do sistema necessárias para build
RUN apk add --no-cache git

COPY go.mod go.sum* ./
RUN go mod download

COPY . .

# Compila binário estático
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o nat-server cmd/main.go

# Runtime stage minimal
FROM alpine:3.19

WORKDIR /app
RUN apk add --no-cache ca-certificates tzdata

COPY --from=builder /app/nat-server /app/nat-server
COPY config.json /app/config.json

EXPOSE 8080

CMD ["/app/nat-server", "-config", "/app/config.json"]
