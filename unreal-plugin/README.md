# Plugin importador — Unreal Engine 5

Companion do World-Esquematics (README §9.2): lê o pacote exportado pelo
editor e monta a cena na Unreal. Exportar arquivos é metade; **isto** é o que
transforma "arquivos numa pasta" em "meu mundo apareceu".

## Conteúdo do pacote exportado

| Arquivo | Conteúdo |
|---------|----------|
| `heightmap.r16` | uint16 little-endian, linha 0 = norte |
| `weightmaps/<bioma>.png` | 1 PNG 8-bit por bioma (feather aplicado) |
| `objects.json` | objetos manuais (posição/yaw/escala em unidades da UE) |
| `scatter.csv` | vegetação materializada: `type,x,y,z,yaw,scale` |
| `splines.json` | grafo de estradas (Béziers cúbicas, largura, material) |
| `water.json` | mar/lagos/rios com cotas e polígonos |
| `metadata.json` | regiões e POIs |
| `unreal_import.json` | manifest com resolução, escalas e localização |

Todas as coordenadas já estão no espaço da Unreal (Z-up canhoto, cm): o
eixo norte-sul vem espelhado e o yaw com sinal invertido — não converta de
novo.

## Uso no editor

1. Habilite o **Python Editor Script Plugin** (Edit → Plugins).
2. Importe o Landscape manualmente com os valores do manifest (o script
   imprime as instruções exatas — criação de Landscape não tem API Python
   confiável): Landscape Mode → Import from File → `heightmap.r16`, com a
   resolução, `Scale` e `Location` do `unreal_import.json`. Adicione as
   weightmaps como Layers do material.
3. No console Python do editor:

   ```python
   import sys; sys.path.append(r"C:/caminho/para/unreal-plugin")
   import import_world
   import_world.run(r"C:/caminho/para/o/export", assets=r".../assets.json")
   ```

O script então: confere/ajusta escala e posição do Landscape; spawna os
objetos manuais, a vegetação (até `max_scatter`, padrão 50 000 — para
florestas em massa use foliage/HISM com o `scatter.csv`) e os POIs
(TargetPoints); e cria as splines de estrada se você passar
`road_bp="/Game/SeuBP"` (um Blueprint com um `SplineComponent`).

### Mapeamento de assets

`assets.json` mapeia o `type` do editor para um asset da engine:

```json
{
  "pine_tree_01": "/Game/Foliage/PineTree01.PineTree01",
  "tower_01": "/Game/Buildings/Tower01.Tower01"
}
```

Tipos sem mapeamento usam placeholders (`/Engine/BasicShapes/*`).

## Validação sem a engine (CI)

```bash
python3 import_world.py --bundle <pasta-do-export> --dry-run --plan-out plan.json
```

Calcula o plano completo (transforms, tangentes das splines, contagens) sem
tocar na engine — é isto que o teste de round-trip do mapa "L" executa.
