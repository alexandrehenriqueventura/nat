package config

import (
	"encoding/json"
	"fmt"
	"os"
)

type Config struct {
	HTTPPort       int      `json:"http_port"`
	AgentToken     string   `json:"agent_token"`
	OperatorToken  string   `json:"operator_token"`
	DBPath         string   `json:"db_path"`
	CORSOrigins    []string `json:"cors_origins"`
	AgentTimeoutS  int      `json:"agent_timeout_s"`
}

func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("lendo config: %w", err)
	}
	var cfg Config
	if err := json.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parseando config: %w", err)
	}
	// defaults
	if cfg.HTTPPort == 0 {
		cfg.HTTPPort = 8080
	}
	if cfg.AgentTimeoutS == 0 {
		cfg.AgentTimeoutS = 30
	}
	if cfg.DBPath == "" {
		cfg.DBPath = "./nat.db"
	}
	return &cfg, nil
}
