package api

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/nat/server/internal/db"
)

type CompanyResponse struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Color       string `json:"color"`
	CreatedAt   string `json:"created_at"`
}

func formatCompany(row db.CompanyRow) CompanyResponse {
	return CompanyResponse{
		ID:          row.ID,
		Name:        row.Name,
		Description: row.Description,
		Color:       row.Color,
		CreatedAt:   row.CreatedAt.Format(time.RFC3339),
	}
}

func handleGetCompanies(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		rows, err := database.Companies.GetAll()
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		resp := make([]CompanyResponse, 0, len(rows))
		for _, row := range rows {
			resp = append(resp, formatCompany(row))
		}
		writeJSON(w, http.StatusOK, resp)
	}
}

func handleCreateCompany(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name        string `json:"name"`
			Description string `json:"description"`
			Color       string `json:"color"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "body inválido", http.StatusBadRequest)
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			http.Error(w, "nome é obrigatório", http.StatusBadRequest)
			return
		}
		if req.Color == "" {
			req.Color = "#3b82f6"
		}

		id := "empresa-" + uuid.New().String()[:8]
		row, err := database.Companies.Create(id, req.Name, req.Description, req.Color)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusCreated, formatCompany(*row))
	}
}

func handleUpdateCompany(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if id == "" {
			id = strings.TrimPrefix(r.URL.Path, "/api/companies/")
		}
		if id == "" {
			http.Error(w, "id obrigatório", http.StatusBadRequest)
			return
		}

		existing, err := database.Companies.GetByID(id)
		if err != nil || existing == nil {
			http.Error(w, "empresa não encontrada", http.StatusNotFound)
			return
		}

		var req struct {
			Name        *string `json:"name"`
			Description *string `json:"description"`
			Color       *string `json:"color"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "body inválido", http.StatusBadRequest)
			return
		}

		name := existing.Name
		if req.Name != nil && *req.Name != "" {
			name = *req.Name
		}
		desc := existing.Description
		if req.Description != nil {
			desc = *req.Description
		}
		color := existing.Color
		if req.Color != nil && *req.Color != "" {
			color = *req.Color
		}

		if err := database.Companies.Update(id, name, desc, color); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		updated, _ := database.Companies.GetByID(id)
		writeJSON(w, http.StatusOK, formatCompany(*updated))
	}
}

func handleDeleteCompany(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		id := r.PathValue("id")
		if id == "" {
			id = strings.TrimPrefix(r.URL.Path, "/api/companies/")
		}
		if id == "" {
			http.Error(w, "id obrigatório", http.StatusBadRequest)
			return
		}

		if err := database.Companies.Delete(id); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}

func handleBulkAssignCompany(database *db.DB) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		companyID := r.PathValue("id")
		if companyID == "" {
			path := strings.TrimPrefix(r.URL.Path, "/api/companies/")
			parts := strings.Split(path, "/")
			if len(parts) >= 1 {
				companyID = parts[0]
			}
		}

		var req struct {
			Assign []string `json:"assign"`
			Unlink []string `json:"unlink"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			http.Error(w, "body inválido", http.StatusBadRequest)
			return
		}

		if err := database.Companies.BulkAssign(companyID, req.Assign, req.Unlink); err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
	}
}
