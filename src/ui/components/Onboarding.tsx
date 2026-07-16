import { useEffect, useState } from 'react';
import {
  AddBiomePolygonCommand,
  FloodFillWaterCommand,
  RoadGraphCommand,
  SculptCommand,
  SetSeaLevelCommand,
  type Command,
} from '../../core';
import type { ProjectSession } from '../session';

/**
 * Onboarding (README §11, item 33): checklist dos 5 gestos que definem o
 * produto. Os passos se MARCAM SOZINHOS observando os comandos executados —
 * o tutorial acontece fazendo, não lendo. Dispensável e lembrado por
 * localStorage.
 */

const DISMISSED_KEY = 'wesq.onboarding.dismissed';

interface Step {
  id: string;
  label: string;
  hint: string;
  matches: (command: Command) => boolean;
}

const STEPS: Step[] = [
  {
    id: 'sculpt',
    label: 'Esculpir o relevo',
    hint: 'ferramenta Esculpir — arraste no mapa',
    matches: (c) => c instanceof SculptCommand,
  },
  {
    id: 'water',
    label: 'Colocar água',
    hint: 'ferramenta Água — nível do mar ou clique numa depressão',
    matches: (c) => c instanceof FloodFillWaterCommand || c instanceof SetSeaLevelCommand,
  },
  {
    id: 'road',
    label: 'Traçar uma estrada',
    hint: 'ferramenta Estrada — cliques criam o traçado, Enter conclui',
    matches: (c) => c instanceof RoadGraphCommand,
  },
  {
    id: 'biome',
    label: 'Pintar um bioma',
    hint: 'ferramenta Bioma — desenhe um polígono, Enter fecha',
    matches: (c) => c instanceof AddBiomePolygonCommand,
  },
  {
    id: 'export',
    label: 'Exportar para a Unreal',
    hint: 'botão Exportar Unreal — o momento da verdade',
    matches: () => false, // marcado pelo App quando o export conclui
  },
];

interface Props {
  session: ProjectSession;
  /** muda quando um export Unreal conclui */
  exportTick: number;
}

export function Onboarding({ session, exportTick }: Props) {
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISSED_KEY) === '1');
  const [done, setDone] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (dismissed) return;
    return session.bus.events.on('executed', ({ command }) => {
      const step = STEPS.find((s) => !done.has(s.id) && s.matches(command));
      if (step) setDone((current) => new Set(current).add(step.id));
    });
  }, [session, dismissed, done]);

  useEffect(() => {
    if (exportTick > 0) setDone((current) => new Set(current).add('export'));
  }, [exportTick]);

  if (dismissed) return null;
  const remaining = STEPS.filter((s) => !done.has(s.id)).length;

  return (
    <aside className="onboarding" data-testid="onboarding">
      <header>
        <strong>{remaining === 0 ? 'Você já sabe o essencial!' : 'Primeiros passos'}</strong>
        <button
          className="link-btn"
          onClick={() => {
            localStorage.setItem(DISMISSED_KEY, '1');
            setDismissed(true);
          }}
        >
          dispensar
        </button>
      </header>
      <ul>
        {STEPS.map((step) => (
          <li key={step.id} className={done.has(step.id) ? 'done' : ''}>
            <span className="check">{done.has(step.id) ? '✓' : '○'}</span>
            <span>
              {step.label}
              {!done.has(step.id) && <em> — {step.hint}</em>}
            </span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
