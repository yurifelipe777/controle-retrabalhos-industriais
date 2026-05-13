# POP-08: Importação da Planilha Legado
# Controle de Retrabalhos Industriais

---

## Objetivo
Descrever como a planilha "Planilha de Retrabalho.xlsx" é analisada e como seus dados são usados para popular o cadastro mestre.

## Premissas

1. A planilha é **referência histórica** — não fonte transacional
2. Os dados dela NÃO se tornam movimentações reais
3. Part numbers, descrições e famílias PODEM ser importados para `product_master`
4. Histórico quantitativo pode ir para `legacy_rework_snapshots` (opcional, sem impacto operacional)
5. O saldo operacional do sistema nasce SOMENTE de `rework_lots` + `lot_movements`

## Análise da Planilha

### Arquivo
- **Caminho:** `public/Planilha de Retrabalho.xlsx`
- **Tamanho:** ~2.4 MB

### Análise de Conteúdo (pendente)
- [ ] Identificar abas (sheets)
- [ ] Identificar colunas por aba
- [ ] Verificar formatação de part numbers
- [ ] Identificar famílias presentes
- [ ] Verificar qualidade dos dados (valores nulos, duplicatas, inconsistências)
- [ ] Mapear setores/etapas para `process_stages`

### Resultado esperado (a registrar em findings.md)
```
Aba principal: <nome>
Colunas identificadas:
  - Part Number: <nome da coluna>
  - Descrição: <nome da coluna>
  - Família: <nome da coluna>
  - Setor: <nome da coluna>
  - Quantidade: <nome da coluna>
  - Data: <nome da coluna>

Quantidade de part numbers únicos: <N>
Quantidade de famílias únicas: <N>
Setores identificados: [lista]
Inconsistências encontradas: [lista]
```

## Script de Importação

### Localização: tools/import_spreadsheet.py

```python
# tools/import_spreadsheet.py
# Propósito: Extrair dados da planilha e preparar SQL de INSERT para product_master
# Pré-requisito: pip install openpyxl pandas

import pandas as pd
import re
import json
from pathlib import Path

def normalize_part_number(pn: str) -> str:
    """Remove pontos, espaços, barras, hífens. Mantém zeros à esquerda."""
    if not pn:
        return ''
    return re.sub(r'[.\s/\-]', '', str(pn).strip())

def main():
    xlsx_path = Path(__file__).parent.parent / 'public' / 'Planilha de Retrabalho.xlsx'
    
    print(f"Lendo planilha: {xlsx_path}")
    xl = pd.ExcelFile(xlsx_path)
    
    print(f"Abas encontradas: {xl.sheet_names}")
    
    # TODO: Após análise, mapear colunas corretas
    # df = pd.read_excel(xlsx_path, sheet_name='NomeAba')
    # part_numbers = extrair_part_numbers(df)
    # salvar_sql(part_numbers)
    
    print("Análise concluída. Registrar resultados em findings.md")

if __name__ == '__main__':
    main()
```

## Tela de Importação (Frontend)

### Rota: /materiais (aba Importação)

**Funcionalidade:**
1. Admin faz upload de planilha
2. Sistema processa (frontend ou Edge Function)
3. Exibe preview dos dados a importar
4. Admin confirma ou rejeita linha a linha
5. Sistema insere em product_master (ignorando duplicatas via ON CONFLICT)

### Regras da importação via UI
1. Apenas admin pode importar
2. Duplicatas (mesmo normalized_part_number) são ignoradas/atualizadas
3. Part numbers sem descrição são rejeitados com aviso
4. Preview antes de confirmar (sem auto-insert silencioso)
5. Log de importação gerado em audit_log

## SQL: Inserção segura em product_master

```sql
INSERT INTO product_master (part_number, normalized_part_number, description, family)
VALUES ($1, normalize_part_number($1), $2, $3)
ON CONFLICT (normalized_part_number)
DO UPDATE SET
  description = EXCLUDED.description,
  family = COALESCE(EXCLUDED.family, product_master.family),
  updated_at = now();
```

## Snapshot Legado (opcional)

Se o usuário quiser preservar o histórico da planilha sem impacto operacional:

```sql
INSERT INTO legacy_rework_snapshots 
  (snapshot_date, part_number, normalized_part_number, description, family, stage_name, quantity, source_file)
VALUES 
  ($snapshot_date, $pn, normalize_part_number($pn), $desc, $family, $stage, $qty, 'Planilha de Retrabalho.xlsx');
```

**Atenção:** Dados da tabela `legacy_rework_snapshots` NUNCA devem ser usados como saldo operacional.

## Casos de Borda

| Situação | Comportamento |
|---|---|
| Part number duplicado | ON CONFLICT → update description/family se ausente |
| Part number sem descrição | Rejeitar com aviso claro |
| Família nula | Importar com family = NULL (editável depois) |
| Planilha com formato diferente | Script falha → registrar erro em findings.md |
| Dados históricos inconsistentes | Importar para legacy_snapshots, não para operacional |
