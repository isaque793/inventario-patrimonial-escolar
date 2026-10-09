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

## Passo a passo (local ou produção)

Os comandos usam o `DATABASE_URL` do `.env`. Para produção, aponte o `.env`
para o Aiven e **rode sempre o `--dry-run` antes**.

1. **Preparar o banco** (cria as tabelas do histórico, a coluna `siadCode` e a
   coluna `sei`, se faltarem; pode rodar mais de uma vez):

   ```
   pnpm tsx scripts/migrateHistoricalInventory.ts --dry-run
   pnpm tsx scripts/migrateHistoricalInventory.ts
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
   SIAD e grava tudo numa transação por escola. Uma planilha com problema não
   impede as outras. Se a escola já tiver carga do mesmo ano, ela é pulada,
   a menos que se use `--replace`.

   Para uma planilha sem SIAD no cabeçalho:
   `--file "caminho.xlsx" --school-id 12 --year 2025`.

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
