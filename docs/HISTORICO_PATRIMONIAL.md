# Histórico patrimonial (cargas antigas da SIAD)

O histórico guarda as cargas patrimoniais de anos anteriores, exportadas da
SIAD. Ele **não** vira inventário atual. Quando alguém cadastra um bem e
informa ou lê o número patrimonial, o formulário consulta o histórico da
escola e preenche automaticamente descrição, código de despesa, valor e estado
de conservação. A pessoa confere antes de salvar.

## Como a escola é identificada

Cada planilha de carga traz no cabeçalho `COD. SIAD: 1265367`. Esse código
precisa estar em `schools.siadCode`. Ele aparece no cadastro da escola, e só a
equipe gestora pode alterá-lo.

## Estrutura do banco

As colunas e tabelas novas (`schools.siadCode`, `inventoryIssues.sei`,
`historicalInventoryLoads`, `historicalInventoryItems`) são criadas
**automaticamente quando o servidor inicia** (`server/schemaUpgrades.ts`).
Esses ajustes só acrescentam estrutura: nada é apagado ou alterado. Por isso,
o deploy no Render é seguro mesmo sem nenhum passo manual. O log mostra
`[Schema] ...` com o que foi feito.

Para ver antes o que seria feito num banco (por exemplo, o do Aiven):

```
pnpm tsx scripts/migrateHistoricalInventory.ts --dry-run
```

## Passo a passo da carga (local ou produção)

Os comandos usam o `DATABASE_URL` do `.env`. Para a produção, crie um arquivo
`.env.production` (já está no `.gitignore`) com o `DATABASE_URL` do Aiven e
aponte para ele só na sessão do PowerShell, sem mexer no `.env`:

```
$env:DOTENV_CONFIG_PATH=".env.production"
```

Para voltar ao banco local, feche o terminal ou rode
`Remove-Item Env:DOTENV_CONFIG_PATH`. **Rode sempre o `--dry-run` antes.**

1. **Conferir o banco:**

   ```
   pnpm tsx scripts/migrateHistoricalInventory.ts --dry-run
   ```

2. **Preencher o SIAD das escolas** a partir da lista da SRE:

   ```
   pnpm tsx scripts/fillSchoolSiadCodes.ts --file "dados-historicos/Escolas_da_SRE_A.xlsx"
   pnpm tsx scripts/fillSchoolSiadCodes.ts --file "dados-historicos/Escolas_da_SRE_A.xlsx" --apply
   ```

   Sem `--apply`, o script só mostra o relatório. Com `--apply`, ele grava
   apenas quando o código da escola e o nome batem. Os casos marcados com `?`
   (mesmo nome com outro código, ou mesmo código com outro nome) só são
   gravados com `--include-uncertain`, depois de conferidos. Escolas sem
   correspondência recebem o SIAD pelo cadastro da escola.

3. **Colocar as planilhas de carga numa pasta por ano:**

   ```
   dados-historicos/
     2025/
       EE EDMUNDO PENA.xlsx
       ...
   ```

   A pasta `dados-historicos/` está no `.gitignore`. As planilhas têm números
   patrimoniais e valores e **não devem ir para o repositório** (ele é público).

4. **Importar:**

   ```
   pnpm tsx scripts/importHistoricalInventory.ts --dir dados-historicos/2025 --dry-run
   pnpm tsx scripts/importHistoricalInventory.ts --dir dados-historicos/2025
   ```

   Para cada planilha, o script confere a quantidade e o valor com o
   `TOTAL GLOBAL`, recusa números patrimoniais repetidos, acha a escola pelo
   SIAD, confere se o nome da unidade no cabeçalho ("UN. ADMINISTRATIVA")
   bate com o nome da escola (trava contra SIAD trocado) e grava tudo numa
   transação por escola. Uma planilha com problema não
   impede as outras. Se a escola já tiver carga do mesmo ano, ela é pulada,
   a menos que se use `--replace`.

   Para uma planilha sem SIAD no cabeçalho, ou cujo SIAD não bate com a escola
   e você já conferiu manualmente:
   `--file "caminho.xlsx" --school-id 12 --year 2025`.

   Se a coluna VALOR vier com `#VALUE!`, os valores se perderam na exportação:
   exporte a planilha de novo da SIAD.

## Conferência

```
pnpm tsx scripts/checkDatabase.ts
```

```sql
SELECT s.name, l.year, COUNT(i.id) AS itens, SUM(i.totalValue) AS valor
FROM historicalInventoryLoads l
JOIN schools s ON s.id = l.schoolId
JOIN historicalInventoryItems i ON i.loadId = l.id
GROUP BY l.id ORDER BY s.name;
```
