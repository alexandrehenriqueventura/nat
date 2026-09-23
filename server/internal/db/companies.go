package db

import (
	"database/sql"
	"fmt"
	"time"
)

// CompanyRow é a linha da tabela companies.
type CompanyRow struct {
	ID          string
	Name        string
	Description string
	Color       string
	CreatedAt   time.Time
}

// CompanyRepo gerencia operações de empresa no banco.
type CompanyRepo struct{ db *sql.DB }

func (r *CompanyRepo) GetAll() ([]CompanyRow, error) {
	rows, err := r.db.Query(
		`SELECT id, name, description, color, created_at FROM companies ORDER BY name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var result []CompanyRow
	for rows.Next() {
		var c CompanyRow
		if err := rows.Scan(&c.ID, &c.Name, &c.Description, &c.Color, &c.CreatedAt); err != nil {
			return nil, err
		}
		result = append(result, c)
	}
	return result, rows.Err()
}

func (r *CompanyRepo) GetByID(id string) (*CompanyRow, error) {
	var c CompanyRow
	err := r.db.QueryRow(
		`SELECT id, name, description, color, created_at FROM companies WHERE id = ?`, id,
	).Scan(&c.ID, &c.Name, &c.Description, &c.Color, &c.CreatedAt)
	if err == sql.ErrNoRows {
		return nil, nil
	}
	return &c, err
}

func (r *CompanyRepo) Create(id, name, description, color string) (*CompanyRow, error) {
	now := time.Now().UTC()
	_, err := r.db.Exec(
		`INSERT INTO companies (id, name, description, color, created_at) VALUES (?, ?, ?, ?, ?)`,
		id, name, description, color, now,
	)
	if err != nil {
		return nil, fmt.Errorf("criando empresa: %w", err)
	}
	return &CompanyRow{ID: id, Name: name, Description: description, Color: color, CreatedAt: now}, nil
}

func (r *CompanyRepo) Update(id, name, description, color string) error {
	res, err := r.db.Exec(
		`UPDATE companies SET name = ?, description = ?, color = ? WHERE id = ?`,
		name, description, color, id,
	)
	if err != nil {
		return err
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return fmt.Errorf("empresa não encontrada: %s", id)
	}
	return nil
}

func (r *CompanyRepo) Delete(id string) error {
	// devices.company_id → NULL via ON DELETE SET NULL na FK
	_, err := r.db.Exec(`DELETE FROM companies WHERE id = ?`, id)
	return err
}

// BulkAssign associa deviceIDs à company e remove unlinkIDs da mesma.
func (r *CompanyRepo) BulkAssign(companyID string, assign, unlink []string) error {
	tx, err := r.db.Begin()
	if err != nil {
		return err
	}

	for _, id := range assign {
		if _, err := tx.Exec(`UPDATE devices SET company_id = ? WHERE id = ?`, companyID, id); err != nil {
			tx.Rollback()
			return err
		}
	}
	for _, id := range unlink {
		if _, err := tx.Exec(`UPDATE devices SET company_id = NULL WHERE id = ? AND company_id = ?`, id, companyID); err != nil {
			tx.Rollback()
			return err
		}
	}
	return tx.Commit()
}
