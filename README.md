# World-Esquematics

Arquitetura · MD
# Arquitetura — Editor de Mapas em Camadas
 
> Documento de arquitetura e plano de implementação.
> Alvo: editor 2D top-down de mapas em camadas, com exportação para engines 3D.
> Distribuição: assinatura web + licença vitalícia (Steam).
 
---
 
## 0. Decisões fundamentais
 
Estas decisões são caras de reverter. Estão no topo de propósito.
 
| # | Decisão | Escolha | Motivo |
|---|---------|---------|--------|
| D1 | Verdade única | `WorldData` puro, sem dependência de UI ou engine | Permite headless, testes, novos exportadores |
| D2 | Extensão × resolução | **Desacopladas** | 16 km em 1 m/célula = 1 GB. Inviável |
| D3 | Formato do relevo | `uint16` + `heightRange` | Formato nativo do landscape da Unreal |
| D4 | Rasters | Divididos em **tiles** de 512×512 | Undo barato, render parcial, save incremental |
| D5 | Vetores | Coordenadas em **metros float64** | Precisão independente da resolução do raster |
| D6 | Derivados | **Nunca persistidos** | Curvas, hillshade, grid, profundidade = calculados |
| D7 | Edição | **Command pattern** desde o commit 1 | Undo/redo é impossível de retrofitar |
| D8 | Água | Terreno contínuo + corpos d'água com cota | Profundidade é derivada, margens grátis |
| D9 | Estradas | **Grafo planar** de splines, não polilinhas soltas | Interseções precisam ser nós reais |
| D10 | Espaço canônico | X=Leste, Y=Norte, Z=Cima (destro, Z-up) | Um único espaço; exportador converte |
 
---
 
## 1. Estrutura do Mundo
 
```yaml
WorldConfig:
  projectName: string
  extent:
    width_m: 16000        # extensão real em metros
    height_m: 16000
  terrainResolution_m: 4.0  # metros por célula do heightmap
  # => grid derivado: 4000 x 4000 células
  heightRange:
    min_m: -200.0         # mapeia para uint16 = 0
    max_m: 1800.0         # mapeia para uint16 = 65535
    # precisão vertical = (max-min)/65535 = 3.05 cm
  origin:
    lat: null             # opcional, se georreferenciado
    lon: null
  createdAt: iso8601
  formatVersion: 1
```
 
### 1.1 Tabela de custo de memória (decidir na criação do projeto)
 
| Extensão | Resolução | Grid | uint16 | Viável no browser |
|----------|-----------|------|--------|-------------------|
| 4×4 km | 1 m | 4096² | 33 MB | Sim |
| 8×8 km | 2 m | 4096² | 33 MB | Sim |
| 16×16 km | 4 m | 4000² | 32 MB | Sim (recomendado) |
| 16×16 km | 2 m | 8000² | 128 MB | Limite; exige tiles em disco |
| 16×16 km | 1 m | 16000² | 512 MB | **Não** |
 
**Regra:** o usuário escolhe extensão e resolução na criação; a UI mostra o custo em MB em tempo real e bloqueia combinações acima do orçamento da plataforma (web: 256 MB; desktop: 2 GB).
 
### 1.2 Conversão de coordenadas
 
```
mundo (m)  ->  célula:  cx = floor(x_m / terrainResolution_m)
célula     ->  mundo:   x_m = cx * terrainResolution_m   (canto)
altura     ->  uint16:  h16 = round((h_m - min_m) / (max_m - min_m) * 65535)
uint16     ->  altura:  h_m = min_m + (h16 / 65535) * (max_m - min_m)
```
 
Amostragem de altura em posição arbitrária (para estradas/objetos): **bilinear** entre as 4 células vizinhas. Nunca nearest — causa objetos "pulando" ao mover.
 
---
 
## 2. Princípio arquitetural
 
```
┌─────────────────────────────────────────────┐
│  UI (React/Canvas)                           │  ← descartável
├─────────────────────────────────────────────┤
│  Viewport / Render Pipeline                  │  ← só lê
├─────────────────────────────────────────────┤
│  Tools (sculpt, water, spline, measure)      │  ← só emite Commands
├─────────────────────────────────────────────┤
│  Command Bus  +  History                     │  ← única porta de escrita
├─────────────────────────────────────────────┤
│  ★ WORLD DATA (a verdade)                    │  ← puro, sem I/O, sem UI
├─────────────────────────────────────────────┤
│  Derived Cache (contornos, hillshade, flow)  │  ← invalidado por dirty tiles
├─────────────────────────────────────────────┤
│  Serialização  │  Exportadores  │  Platform  │
└─────────────────────────────────────────────┘
```
 
**Regra de ouro:** nada abaixo da linha do WorldData pode importar nada acima dela. Se o `WorldData` conhece o React, a arquitetura já morreu. Teste prático: o core deve rodar em Node.js, sem DOM, num teste unitário.
 
**Fluxo de escrita (único):**
```
Tool → Command → CommandBus.execute() → WorldData.mutate()
                                      → marca tiles sujos
                                      → invalida DerivedCache
                                      → emite evento
                                      → Viewport redesenha só o sujo
```
 
---
 
## 3. Reclassificação dos 17 sistemas
 
| Sua ideia | Categoria | Onde vive |
|-----------|-----------|-----------|
| 1. Estrutura do Mundo | Config | `WorldConfig` |
| 2. Sistema de Camadas | Infra | `LayerStack` |
| 3. Relevo | **Dado** (raster) | `TerrainLayer` |
| 4. Hidrografia | **Dado** (vetor + raster) | `WaterLayer` |
| 5. Biomas | **Dado** (vetor + raster) | `BiomeLayer` |
| 6. Camada Visual | **Não é camada** — é o render | Viewport |
| 7. Curvas de Nível | **Derivado** | `DerivedCache.contours` |
| 8. Estradas | **Dado** (grafo) | `RoadLayer` |
| 9. Regiões | **Dado** (vetor) | `RegionLayer` |
| 10. POIs | **Dado** (pontos) | `POILayer` |
| 11. Objetos | **Dado** (pontos) | `ObjectLayer` |
| 12. Grid | **Derivado** | Viewport overlay |
| 13. Esculpir | **Ferramenta** | `SculptTool` |
| 14. Água | **Ferramenta** | `WaterTool` |
| 15. Medição | **Ferramenta** (não escreve) | `MeasureTool` |
| 16. Organização | UI | `Outliner` |
| 17. Exportação | Saída | `exporters/` |
 
Resultado: **7 camadas de dados**, não 17 sistemas.
 
---
 
## 4. Modelo de Dados
 
### 4.1 LayerStack
 
```yaml
Layer:  # interface comum a todas
  id: uuid
  name: string
  type: enum[terrain, water, biome, road, region, poi, object]
  visible: bool
  locked: bool
  opacity: float [0..1]
  order: int
```
 
Nota: `terrain` é **singleton** — existe exatamente um. Não faz sentido ter dois relevos.
As demais podem ter múltiplas instâncias (ex.: "Objetos — Vegetação", "Objetos — Construções").
 
### 4.2 TerrainLayer (raster tiled)
 
```yaml
TerrainLayer:
  tileSize: 512
  tiles: Map<"tx,ty", Uint16Array(512*512)>   # esparso: tile ausente = altura base
  baseHeight_u16: uint16                       # valor de tiles não alocados
```
 
- **Esparso:** um mapa recém-criado ocupa ~0 bytes. Tiles são alocados no primeiro toque.
- `getHeight(x_m, y_m) -> float` faz bilinear e resolve o tile.
- `slope` e `normal` são **derivados** (gradiente central das 4 vizinhas), nunca armazenados.
- "Tipo de solo" da sua lista **não vive aqui** — é a `BiomeLayer`. Um dado, um dono.
### 4.3 WaterLayer
 
O modelo D8: **o terreno continua embaixo da água.** Nunca existe "buraco" no heightmap.
 
```yaml
WaterBody:
  id: uuid
  kind: enum[ocean, lake, river, pond]
  surface_m: float          # cota da superfície (constante em lagos/mar)
  polygon: [[x,y], ...]     # extensão horizontal (lagos, mar)
  material: string
 
RiverSpline:                # rios são splines, não polígonos
  id: uuid
  nodes: [{x, y, width_m, surface_m}]   # surface_m DEVE decrescer ao longo do rio
  carveDepth_m: float
  flowDirection: derivado da ordem dos nós
```
 
**Profundidade nunca é armazenada:**
```
depth(x,y) = waterBody.surface_m - terrain.getHeight(x,y)
se depth <= 0  =>  terra seca (a margem se resolve sozinha)
```
 
Isso te dá de graça: esculpir o relevo move a margem do lago automaticamente; lagos em cotas diferentes; batimetria sem camada extra.
 
**"Água escoa do alto para o baixo" — implementar como assistente, não simulação:**
- `D8 flow direction`: cada célula aponta para a vizinha mais baixa das 8.
- `flow accumulation`: quantas células drenam para cada uma.
- Células com acumulação > limiar = leito natural de rio → botão **"Sugerir rios"** que gera splines.
- `priority-flood`: preenche depressões → botão **"Preencher lago"** a partir de um clique + cota.
Custo: O(n log n) sobre o grid, roda em ~1 s num 4000². É um comando explícito, não um loop contínuo. **Não construa simulação de fluidos em tempo real** — não é o produto.
 
### 4.4 BiomeLayer (híbrida)
 
```yaml
BiomeDefinition:
  id: uint8                 # 0..255, indexa a paleta
  name: string              # "floresta", "deserto"
  color: hex
  materials: [string]       # nomes que o exportador mapeia
  vegetationRules: [{ objectType, density_per_ha, scaleRange, slopeMax_deg }]
 
BiomeLayer:
  palette: [BiomeDefinition]
  polygons: [{ biomeId, polygon, featherRadius_m }]   # autoria vetorial
  raster: Map<"tx,ty", Uint8Array(512*512)>           # rasterizado, cache
```
 
Autoria em **polígono** (editável, limpo). O raster uint8 é o **resultado rasterizado** — é ele que vira weightmap na exportação. Regra: polígono é fonte, raster é cache invalidável.
 
### 4.5 RoadLayer (grafo planar)
 
Este é o ponto mais sutil da sua lista. "Ponto A e ponto B, mova os controles" está certo — mas as estradas precisam se **conhecer**.
 
```yaml
RoadNode:
  id: uuid
  pos: {x, y}
  kind: enum[endpoint, intersection]
 
RoadEdge:
  id: uuid
  from: nodeId
  to: nodeId
  controls: [{x,y}, {x,y}]     # Bézier cúbica: from, c1, c2, to
  width_m: float
  type: enum[trail, dirt, gravel, asphalt, highway, bridge]
  material: string
  carveTerrain: bool
  maxGrade_pct: float          # inclinação máxima permitida
```
 
- Ao desenhar uma estrada que cruza outra: **inserir nó de interseção em ambas** e dividir as arestas. Sem isso não existe snap, nem render de cruzamento, nem detecção de quadras.
- `type: bridge` = trecho que **ignora** o relevo (não carva, mantém cota) — é assim que o rio passa por baixo.
- Carve do terreno é um **Command explícito** ("Aplicar estrada ao relevo"), não automático. Automático = o usuário perde controle e o undo vira pesadelo.
Amostragem da spline: flatten adaptativo por tolerância (0,5 m), não por número fixo de segmentos.
 
### 4.6 Camadas vetoriais simples
 
```yaml
Region:
  id: uuid
  name: string
  description: string
  polygon: [[x,y], ...]
  color: hex
  properties: Map<string, any>    # livre, do usuário
 
POI:
  id: uuid
  name: string
  icon: string
  pos: {x, y}
  properties: Map<string, any>
 
MapObject:
  id: uuid
  type: string                    # "pine_tree_01", "house_medieval_02"
  pos: {x, y}
  z_offset_m: float               # 0 = colado no terreno (padrão)
  rotation_deg: float             # rotação em Z (yaw)
  scale: {x, y, z}
  alignToSlope: bool
  tags: [string]
```
 
**Z do objeto é derivado:** `z = terrain.getHeight(x,y) + z_offset_m`. Nunca armazene o Z absoluto — o objeto flutuaria ao esculpir o terreno embaixo dele.
 
### 4.7 Escala de objetos
 
Um mapa de 16 km com vegetação pode ter **milhões** de objetos. Não guarde um objeto JS por árvore.
 
- **Objetos manuais** (casas, pontes, POIs): lista de structs. Milhares. OK.
- **Vegetação por regra**: não armazene instância nenhuma. Armazene a *regra* (`vegetationRules` do bioma) + seed. Gere no exportador e no render por scatter determinístico. Milhões de árvores viram ~200 bytes.
- Se o usuário editar uma árvore gerada, ela vira exceção explícita (`overrides: [{index, ...}]` ou `deleted: [index]`).
Sem isso, o arquivo do projeto passa de 1 GB e o editor trava.
 
---
 
## 5. Command Pattern (D7)
 
Toda escrita passa por aqui. Sem exceção.
 
```typescript
interface Command {
  readonly label: string;          // "Esculpir terreno", "Mover objeto"
  apply(world: WorldData): void;
  revert(world: WorldData): void;
  readonly memoryCost: number;     // bytes, para o orçamento do histórico
  mergeWith?(next: Command): Command | null;  // coalescência
}
```
 
### 5.1 Undo de raster (o ponto crítico)
 
Um traço de pincel toca N tiles. **Não copie o mapa inteiro.**
 
```typescript
class SculptCommand implements Command {
  private before: Map<TileKey, Uint16Array>;  // só os tiles tocados
  private after:  Map<TileKey, Uint16Array>;
}
```
 
- Um traço em 4 tiles = 4 × 512 KB × 2 (before+after) = **4 MB**. Comprimido (LZ4/zstd) na hora de empilhar: ~200 KB.
- **Orçamento do histórico em MB, não em contagem.** Ex.: teto de 512 MB; descarta os mais antigos. 50 comandos de sculpt e 50 de "renomear objeto" têm custos que diferem em 10.000×.
- **Coalescência:** um traço de mouse gera ~100 eventos. Todos devem virar **um** comando. Abra o comando no `mousedown`, acumule, feche no `mouseup`.
### 5.2 Comandos previstos
 
| Comando | Custo | Coalesce |
|---------|-------|----------|
| SculptCommand | tiles tocados | sim (por traço) |
| PaintBiomeCommand | tiles tocados | sim (por traço) |
| FloodFillWaterCommand | polígono | não |
| AddRoadEdgeCommand | struct | não |
| MoveControlPointCommand | struct | sim (por arraste) |
| AddObjectCommand | struct | não |
| TransformObjectsCommand | structs | sim (por arraste) |
| SetLayerPropertyCommand | struct | não |
 
---
 
## 6. Pipeline de Render
 
Canvas 2D não desenha um heightmap de 4000² a 60 fps. **WebGL para raster, Canvas 2D para vetor.**
 
```
┌── WebGL canvas (fundo) ──────────────────┐
│  1. Terreno: hillshade + rampa de cor    │  fragment shader, lê tiles como textura
│  2. Biomas: paleta indexada, blend       │
│  3. Água: máscara por profundidade       │  depth = surface - height, no shader
├── Canvas 2D (frente) ────────────────────┤
│  4. Curvas de nível                      │  marching squares, cache por tile
│  5. Estradas (splines)                   │
│  6. Regiões (polígonos)                  │
│  7. Objetos (ícones/sprites)             │  culling + LOD por zoom
│  8. Grid, réguas, medição                │
│  9. Handles de seleção, gizmos           │
└──────────────────────────────────────────┘
```
 
### 6.1 Hillshade (é isto que faz o mapa "parecer" 3D)
 
Puro fragment shader, custo zero:
```glsl
vec3 n = normalFromHeight(uv);           // Sobel nas alturas vizinhas
float lambert = max(dot(n, sunDir), 0.0); // sunDir padrão: azimute 315°, elevação 45°
vec3 color = ramp(height) * (0.4 + 0.6 * lambert);
```
Azimute 315° (noroeste) é a convenção cartográfica — com o sol vindo de outro lado, o cérebro inverte montanhas e vales.
 
### 6.2 Curvas de nível (#7)
 
**Marching squares** sobre o heightmap, por tile, cacheado, invalidado por dirty tile.
- Intervalo adaptativo ao zoom: 100 m → 20 m → 5 m → 1 m.
- Índice a cada 5ª linha (mais grossa, com rótulo).
- Nunca persistir. É função pura do relevo.
### 6.3 Orçamento de performance
 
| Métrica | Alvo |
|---------|------|
| Pan/zoom | 60 fps |
| Feedback do pincel de sculpt | ≤ 16 ms |
| Re-render após sculpt | só tiles sujos |
| Objetos visíveis simultâneos | ≥ 50.000 (com culling + instancing) |
| Abrir projeto de 16 km | ≤ 5 s |
 
---
 
## 7. Ferramentas
 
```typescript
interface Tool {
  onPointerDown(pt: WorldPoint, mods: Modifiers): void;
  onPointerMove(pt: WorldPoint): void;
  onPointerUp(): void;
  drawOverlay(ctx: Canvas2D): void;   // preview do pincel, guias
  readonly cursor: string;
}
```
Ferramentas **nunca** escrevem no WorldData direto. Só emitem Commands.
 
### 7.1 Esculpir (#13)
 
| Modo | Efeito |
|------|--------|
| Raise / Lower | soma ±intensidade × falloff |
| Smooth | média das vizinhas |
| Flatten | puxa para a altura do primeiro clique |
| Ramp | interpola linearmente entre 2 pontos |
| Noise | fractal (fBm), para quebrar artificialidade |
| Erode | erosão hidráulica local (opcional, fase tardia) |
 
```yaml
Brush:
  radius_m: float
  strength: float [0..1]
  falloff: enum[linear, smooth, sharp, constant]
  spacing_pct: float    # reaplicação a cada X% do raio ao arrastar
```
`spacing` é o que impede que um mouse lento cave um poço vertical.
 
### 7.2 Água (#14)
 
- **Preencher lago:** clique + cota → priority-flood → gera `WaterBody` com polígono da borda.
- **Desenhar rio:** spline; valida que `surface_m` decresce; opção de carvar o leito.
- **Nível do mar:** um `WaterBody` global de `kind: ocean` com uma cota. Mudar a cota reflete instantaneamente (é só o shader).
### 7.3 Medição (#15)
 
Única ferramenta que não emite Command. Distância (com e sem relevo — a "distância real" percorre o terreno e é maior), área, perímetro, Δaltitude, inclinação média/máxima em %.
 
---
 
## 8. Formato de Arquivo
 
**Container ZIP** com extensão própria (ex.: `.wmap`). Modelo de `.blend`/`.kra`.
 
```
projeto.wmap  (zip)
├── manifest.json          # WorldConfig, formatVersion
├── layers.json            # LayerStack, vetores (estradas, regiões, POIs, objetos)
├── biomes.json            # paleta + polígonos
├── terrain/
│   ├── 0_0.bin            # Uint16Array cru, 512×512, deflate do zip
│   ├── 0_1.bin
│   └── ...                # só tiles alocados
├── biome_raster/
│   └── 0_0.bin            # Uint8Array
└── thumbnail.png
```
 
**Por quê ZIP:** compressão grátis, tiles individuais legíveis sem carregar tudo, inspecionável com qualquer unzip, save incremental (reescreve só entradas sujas), e qualquer linguagem lê.
 
**Regras:**
- `formatVersion` no manifest desde a v1. Migradores versionados. Você **vai** mudar o schema.
- Nada de derivado dentro do arquivo (sem contornos, sem hillshade, sem profundidade).
- Autosave a cada 5 min em slot rotativo (3 slots). Um crash em 4 h de trabalho de mapa é um usuário perdido.
---
 
## 9. Exportadores
 
O módulo que justifica o produto. **Nenhum exportador pode influenciar o modelo de dados.**
 
```typescript
interface Exporter {
  readonly id: string;              // "unreal5", "unity6", "godot4"
  validate(world: WorldData): ValidationIssue[];   // roda ANTES
  export(world: WorldData, opts): Promise<ExportBundle>;
}
```
 
### 9.1 Unreal (alvo primário)
 
| Elemento | Saída |
|----------|-------|
| Landscape | PNG 16-bit grayscale (ou `.r16` cru) |
| Materiais/biomas | 1 PNG 8-bit por bioma (weightmap) |
| Objetos | JSON/CSV: type, x, y, z, yaw, scale |
| Estradas | JSON de splines (importador cria Landscape Splines) |
| Água | JSON de polígonos + cotas (Water Body Custom) |
| Regiões/POIs | JSON de metadados |
 
**Gotcha #1 — resolução travada.** O landscape da Unreal só aceita tamanhos de uma tabela fixa (505, 1009, 2017, 4033, 8129 vértices por lado, nas configurações recomendadas). Seu grid de 4000² **não é um deles**. O exportador precisa **reamostrar** (bicúbico) para o tamanho válido mais próximo e informar o usuário. Verifique a tabela na versão exata da engine alvo antes de fixar isso no código.
 
**Gotcha #2 — escala Z.** Com Landscape Scale Z = 100 (padrão), o range de uint16 mapeia para aproximadamente −256 m a +256 m. Se seu `heightRange` é 2000 m, o exportador **deve calcular e emitir o Z Scale correto**, senão o mapa chega achatado. Fórmula a confirmar na doc da versão alvo.
 
**Gotcha #3 — eixos.** Unreal é Z-up **canhoto**; seu espaço canônico é Z-up **destro**. Isso é uma inversão de eixo — sem ela, o mapa chega **espelhado**. Cada exportador tem sua matriz de conversão, testada com um mapa assimétrico de referência (um "L" gigante — se chegar como "⌐", o sinal está trocado).
 
### 9.2 Companion plugin
 
Exportar arquivos é metade. O plugin Python/Blueprint que **importa** e monta a cena na Unreal é o que transforma "arquivos numa pasta" em "meu mundo apareceu". É produto, não detalhe — planeje como entregável.
 
### 9.3 Unity / Godot
 
Mesmos dados, adaptadores diferentes. Unity: `TerrainData` + splatmaps (Y-up, canhoto). Godot: `HeightMapShape3D` / plugin (Y-up, destro). Escreva o exportador da Unreal primeiro e **completo** — os outros só valem depois que a interface `Exporter` provar que aguenta um caso real.
 
---
 
## 10. Plataforma (web + Steam)
 
### 10.1 Stack recomendada
 
| Camada | Escolha |
|--------|---------|
| Core | **TypeScript** (puro, sem DOM) |
| Kernels de raster | **Rust → WASM** (sculpt, flood, marching squares, erosão) |
| Render | WebGL2 + Canvas 2D |
| UI | React |
| Desktop/Steam | **Electron** |
 
**Por que TS + WASM híbrido:** o app inteiro em Rust é lento de escrever e a UI sofre. TS puro empaca nos kernels de raster. Comece **100% TypeScript** com os kernels isolados atrás de uma interface (`interface RasterKernels`), e troque por WASM quando o profiler mandar. Se a fronteira estiver limpa, é uma troca de implementação; se não estiver, é uma reescrita.
 
**Por que Electron e não Tauri:** Tauri usa a webview do sistema (WebView2 / WebKitGTK) — o comportamento do WebGL varia por máquina. Para um app que **é** WebGL, isso é risco de suporte distribuído entre milhares de configurações. Electron embute o Chromium: uma versão, um comportamento. Custa ~120 MB de download; usuário de Steam não liga. Reveja essa decisão se o binário virar problema real.
 
### 10.2 Platform Adapter (isola os dois modelos de negócio)
 
O core **não pode saber** se está na web ou na Steam.
 
```typescript
interface Platform {
  storage: ProjectRepository;    // IndexedDB+nuvem | filesystem
  licensing: LicenseProvider;    // JWT do servidor | Steamworks
  telemetry: Telemetry;
  assetLibrary: AssetSource;
}
```
 
| | Web (assinatura) | Steam (vitalício) |
|---|---|---|
| Storage | IndexedDB + sync em nuvem | Filesystem local |
| Projetos | Quota por plano | Ilimitado |
| Licença | JWT, revalida periodicamente | Steamworks, offline OK |
| Updates | Deploy contínuo | Steam pipeline |
| Export | Server-side ou local | Local |
 
**Risco comercial a decidir cedo, não depois:** vitalício na Steam e assinatura na web pelo mesmo software é um convite para todo mundo comprar na Steam. Vetores de diferenciação: nuvem/sync/colaboração só na web; biblioteca de assets como serviço; versão Steam trava numa major (v1.x vitalício, v2 é compra nova — modelo do JetBrains/Sublime). Escolha antes de escrever o `LicenseProvider`, porque isso define o schema de licença.
 
---
 
## 11. Roadmap passo a passo
 
Cada fase termina em algo **usável**. Nada de "fase 4: integrar tudo".
 
### Fase 0 — Fundação (sem isso, nada existe)
1. `WorldConfig`, conversões metro↔célula↔uint16, testes unitários das conversões.
2. `TiledRaster<T>` esparso: get/set, alocação preguiçosa, dirty tracking.
3. `CommandBus` + `History` com orçamento em MB e coalescência.
4. Viewport WebGL: pan, zoom, transformação tela↔mundo.
5. **Entregável:** tela cinza que dá pan/zoom com régua correta em metros.
### Fase 1 — Relevo
6. `TerrainLayer` sobre o `TiledRaster`.
7. Shader de hillshade + rampa de cor.
8. `SculptTool`: raise/lower/smooth/flatten + falloffs + spacing.
9. `SculptCommand` com undo por tile.
10. Curvas de nível (marching squares, cache por tile, intervalo por zoom).
11. **Entregável: já é um produto.** Esculpir terreno e ver curvas de nível.
### Fase 2 — Água
12. `WaterBody` + nível do mar global.
13. Shader de água por profundidade derivada.
14. Flood fill de lago (priority-flood).
15. Rios como spline + validação de cota decrescente + carve.
16. D8 flow accumulation → "Sugerir rios".
### Fase 3 — Vetores
17. Editor de Bézier genérico (nós, handles, snap) — **reusado** por estradas, regiões, biomas, rios.
18. `RoadLayer` como grafo planar: split em interseção, snap a nó.
19. Carve de estrada no relevo (comando explícito) + validação de `maxGrade_pct`.
20. `RegionLayer`, `POILayer`.
### Fase 4 — Biomas e objetos
21. Paleta de biomas, pintura de polígono, rasterização.
22. `ObjectLayer` manual + culling/LOD por zoom.
23. Scatter procedural por regra de bioma (seed determinístico, sem instâncias armazenadas).
### Fase 5 — Produção
24. Outliner: árvore, busca, filtros, tags, lock, hide, agrupar.
25. Formato `.wmap`, save/load, save incremental, autosave, migrador de versão.
### Fase 6 — Exportação (o momento da verdade)
26. Interface `Exporter` + `validate()`.
27. Exportador Unreal completo: heightmap, weightmaps, objetos, splines, água.
28. **Plugin importador da Unreal.**
29. Teste de round-trip com o mapa "L" assimétrico. Sem eixo espelhado, sem mapa achatado.
### Fase 7 — Comercial
30. `Platform` adapter + os dois `LicenseProvider`.
31. Auth, nuvem, cobrança (web).
32. Steamworks, build pipeline.
33. Onboarding, mapas de exemplo, tutorial.
**Ordem inegociável:** 0 → 1 → 6. Faça um exportador Unreal **feio mas funcional** logo depois da Fase 1, com só o heightmap. Descobrir os gotchas de eixo/escala/resolução no mês 2 custa uma tarde; descobrir no mês 10 custa refatorar tudo.
 
---
 
## 12. Riscos
 
| Risco | Impacto | Mitigação |
|-------|---------|-----------|
| Explosão de memória em 16 km | Fatal | D2/D3/D4: extensão desacoplada, uint16, tiles esparsos |
| Undo consome toda a RAM | Alto | Orçamento em MB, delta por tile, compressão |
| Eixo espelhado / mapa achatado no export | Alto | Mapa "L" de teste desde a Fase 1 |
| Milhões de árvores no arquivo | Alto | Scatter por regra + seed, não por instância |
| Escopo (17 sistemas de uma vez) | Alto | Fases 0–1 já são vendáveis; nada depois da 1 é obrigatório para o v1 |
| Canibalização Steam × assinatura | Médio | Definir diferenciação antes do `LicenseProvider` |
| Curva de nível dessincronizada | Médio | D6: derivado nunca persiste |
| Rewrite por acoplamento a engine | Médio | D1: core não importa nada de exportador |
 
---
 
## 13. Estrutura de pastas
 
```
src/
├── core/                    # ZERO imports de UI, DOM, engine
│   ├── world/               # WorldConfig, WorldData, LayerStack
│   ├── layers/              # terrain, water, biome, road, region, poi, object
│   ├── raster/              # TiledRaster, kernels (interface)
│   ├── geometry/            # bezier, polygon, graph planar
│   ├── commands/            # Command, CommandBus, History
│   └── derived/             # contours, flow, hillshade-cpu, cache
├── kernels-wasm/            # Rust → WASM (implementa core/raster/kernels)
├── render/
│   ├── webgl/               # terreno, biomas, água
│   └── canvas2d/            # vetores, overlays, gizmos
├── tools/                   # sculpt, water, spline, select, measure
├── io/
│   ├── format/              # .wmap read/write, migradores
│   └── exporters/           # unreal/, unity/, godot/
├── platform/
│   ├── web/
│   └── electron/
└── ui/                      # React
```
 
**Teste de sanidade da arquitetura:** `core/` deve rodar em Node.js puro. Se `import` de qualquer coisa em `core/` falhar sem DOM, a fronteira foi violada.
