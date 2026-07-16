import { useMemo, useState } from 'react';
import {
  MEMORY_BUDGET_BYTES,
  createWorldConfig,
  deriveGrid,
  estimateTerrainBytes,
  validateWorldConfig,
  verticalPrecision_m,
  type WorldConfig,
} from '../../core';
import { EXAMPLE_WORLDS } from '../../examples/exampleWorlds';
import type { ProjectSummary } from '../../platform/ProjectRepository';

/**
 * Criação de projeto (README §1.1): o usuário escolhe extensão e resolução;
 * a UI mostra o custo em MB EM TEMPO REAL e bloqueia combinações acima do
 * orçamento da plataforma (web: 256 MB).
 */

interface Props {
  onCreate: (config: WorldConfig) => void;
  onOpenFile?: (file: File) => Promise<void>;
  /** projetos do repositório da plataforma (§10.2) */
  projects?: ProjectSummary[];
  onOpenStored?: (id: string) => Promise<void>;
  onDeleteStored?: (id: string) => Promise<void>;
  /** mapas de exemplo do onboarding (item 33) */
  onOpenExample?: (id: string) => void;
  autosave?: { projectName: string; savedAt: number } | null;
  onRestoreAutosave?: () => Promise<void>;
}

export function NewProjectDialog({
  onCreate,
  onOpenFile,
  projects = [],
  onOpenStored,
  onDeleteStored,
  onOpenExample,
  autosave,
  onRestoreAutosave,
}: Props) {
  const [projectName, setProjectName] = useState('Novo mundo');
  const [widthKm, setWidthKm] = useState('16');
  const [heightKm, setHeightKm] = useState('16');
  const [resolution, setResolution] = useState('4');
  const [minHeight, setMinHeight] = useState('-200');
  const [maxHeight, setMaxHeight] = useState('1800');

  const config = useMemo(
    () =>
      createWorldConfig({
        projectName,
        extent: { width_m: Number(widthKm) * 1000, height_m: Number(heightKm) * 1000 },
        terrainResolution_m: Number(resolution),
        heightRange: { min_m: Number(minHeight), max_m: Number(maxHeight) },
      }),
    [projectName, widthKm, heightKm, resolution, minHeight, maxHeight],
  );

  const issues = validateWorldConfig(config, MEMORY_BUDGET_BYTES.web);
  const hasErrors = issues.some((i) => i.severity === 'error');
  const grid = deriveGrid(config);
  const gridValid = Number.isFinite(grid.widthCells) && Number.isFinite(grid.heightCells);
  const megabytes = estimateTerrainBytes(config) / 1_000_000;
  const precisionCm = verticalPrecision_m(config.heightRange) * 100;

  return (
    <div className="dialog-backdrop">
      <form
        className="dialog"
        onSubmit={(e) => {
          e.preventDefault();
          if (!hasErrors) onCreate(config);
        }}
      >
        <h1>Novo projeto</h1>

        <label>
          Nome do projeto
          <input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
        </label>

        <div className="field-row">
          <label>
            Largura (km)
            <input
              type="number"
              min="0"
              value={widthKm}
              onChange={(e) => setWidthKm(e.target.value)}
            />
          </label>
          <label>
            Altura (km)
            <input
              type="number"
              min="0"
              value={heightKm}
              onChange={(e) => setHeightKm(e.target.value)}
            />
          </label>
          <label>
            Resolução (m/célula)
            <input
              type="number"
              min="0"
              step="0.5"
              value={resolution}
              onChange={(e) => setResolution(e.target.value)}
            />
          </label>
        </div>

        <div className="field-row">
          <label>
            Altura mínima (m)
            <input type="number" value={minHeight} onChange={(e) => setMinHeight(e.target.value)} />
          </label>
          <label>
            Altura máxima (m)
            <input type="number" value={maxHeight} onChange={(e) => setMaxHeight(e.target.value)} />
          </label>
        </div>

        <dl className="project-facts">
          <div>
            <dt>Grid derivado</dt>
            <dd>{gridValid ? `${grid.widthCells} × ${grid.heightCells} células` : '—'}</dd>
          </div>
          <div>
            <dt>Memória do heightmap</dt>
            <dd>
              {Number.isFinite(megabytes) ? `${megabytes.toFixed(0)} MB` : '—'} / orçamento web{' '}
              {(MEMORY_BUDGET_BYTES.web / 1_000_000).toFixed(0)} MB
            </dd>
          </div>
          <div>
            <dt>Precisão vertical</dt>
            <dd>{Number.isFinite(precisionCm) ? `${precisionCm.toFixed(2)} cm` : '—'}</dd>
          </div>
        </dl>

        {issues.length > 0 && (
          <ul className="issues">
            {issues.map((issue) => (
              <li key={issue.message} className={`issue-${issue.severity}`}>
                {issue.message}
              </li>
            ))}
          </ul>
        )}

        <button type="submit" disabled={hasErrors}>
          Criar projeto
        </button>

        {projects.length > 0 && onOpenStored && (
          <section className="project-list" data-testid="my-projects">
            <h2>Meus projetos</h2>
            <ul>
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => void onOpenStored(project.id)}
                    title={`${(project.size / 1000).toFixed(0)} kB`}
                  >
                    {project.name}
                  </button>
                  <span className="dimmed">{new Date(project.savedAt).toLocaleString()}</span>
                  {onDeleteStored && (
                    <button
                      type="button"
                      className="link-btn danger"
                      onClick={() => void onDeleteStored(project.id)}
                      title="Excluir projeto"
                    >
                      ×
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </section>
        )}

        {onOpenExample && (
          <section className="project-list">
            <h2>Mapas de exemplo</h2>
            <ul>
              {EXAMPLE_WORLDS.map((example) => (
                <li key={example.id}>
                  <button
                    type="button"
                    className="link-btn"
                    onClick={() => onOpenExample(example.id)}
                  >
                    {example.name}
                  </button>
                  <span className="dimmed">{example.description}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <div className="dialog-secondary">
          {onOpenFile && (
            <label className="open-file">
              Abrir projeto (.wmap)…
              <input
                type="file"
                accept=".wmap"
                style={{ display: 'none' }}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void onOpenFile(file);
                }}
              />
            </label>
          )}
          {autosave && onRestoreAutosave && (
            <button
              type="button"
              className="link-btn"
              onClick={() => void onRestoreAutosave()}
              title={new Date(autosave.savedAt).toLocaleString()}
            >
              Restaurar autosave: “{autosave.projectName}”
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
