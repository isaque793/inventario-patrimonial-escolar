UPDATE inventoryItems
SET
  conservationState = CASE
    WHEN currentSituation = 'Novo' THEN 'Novo'
    WHEN currentSituation = 'Bom' THEN 'Bom'
    WHEN currentSituation = 'Regular' THEN 'Regular'
    WHEN currentSituation = 'Mau' THEN 'Ruim'
    ELSE conservationState
  END,
  currentSituation = CASE
    WHEN currentSituation IN ('Novo', 'Bom', 'Regular', 'Mau') THEN 'Em uso'
    ELSE currentSituation
  END
WHERE currentSituation IN ('Novo', 'Bom', 'Regular', 'Mau');
