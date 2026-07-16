import { useEffect, useRef, type MutableRefObject } from 'react';
import type { Vec2 } from '../../render/Camera2D';
import { Viewport } from '../../render/Viewport';
import type { Tool } from '../../tools/Tool';
import { SculptTool, type BrushSettings } from '../../tools/SculptTool';
import { WaterTool, type WaterSettings } from '../../tools/WaterTool';
import { RoadTool, type RoadSettings } from '../../tools/RoadTool';
import { RegionTool, type RegionSettings } from '../../tools/RegionTool';
import { POITool, type POISettings } from '../../tools/POITool';
import { BiomeTool, type BiomeSettings } from '../../tools/BiomeTool';
import { ObjectTool, type ObjectSettings } from '../../tools/ObjectTool';
import { MeasureTool } from '../../tools/MeasureTool';
import type { ProjectSession } from '../session';
import type { ActiveToolName } from './Toolbar';

interface Props {
  session: ProjectSession;
  activeTool: ActiveToolName;
  brush: BrushSettings;
  waterSettings: WaterSettings;
  roadSettings: RoadSettings;
  regionSettings: RegionSettings;
  poiSettings: POISettings;
  biomeSettings: BiomeSettings;
  objectSettings: ObjectSettings;
  onCursorMove?: (worldPt: Vec2 | null) => void;
  /** expõe o Viewport imperativo (captura de thumbnail no save) */
  apiRef?: MutableRefObject<Viewport | null>;
}

interface ToolSet {
  sculpt: SculptTool;
  water: WaterTool;
  road: RoadTool;
  region: RegionTool;
  poi: POITool;
  biome: BiomeTool;
  object: ObjectTool;
  measure: MeasureTool;
}

/** Ponte React → Viewport imperativo (a UI é descartável — README §2). */
export function ViewportView({
  session,
  activeTool,
  brush,
  waterSettings,
  roadSettings,
  regionSettings,
  poiSettings,
  biomeSettings,
  objectSettings,
  onCursorMove,
  apiRef,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const toolsRef = useRef<ToolSet | null>(null);
  const cursorCallback = useRef(onCursorMove);
  cursorCallback.current = onCursorMove;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const viewport = new Viewport(host, session.world);
    viewport.onCursorMove = (pt) => cursorCallback.current?.(pt);
    viewportRef.current = viewport;
    if (apiRef) apiRef.current = viewport;

    const toolContext = {
      world: session.world,
      bus: session.bus,
      kernels: session.kernels,
      camera: viewport.camera,
      requestRender: () => viewport.requestRender(),
    };
    toolsRef.current = {
      sculpt: new SculptTool(toolContext),
      water: new WaterTool(toolContext),
      road: new RoadTool(toolContext),
      region: new RegionTool(toolContext),
      poi: new POITool(toolContext),
      biome: new BiomeTool(toolContext),
      object: new ObjectTool(toolContext),
      measure: new MeasureTool(toolContext),
    };

    // Comandos, undo e redo redesenham o viewport (fluxo do README §2).
    const unsubscribe = [
      session.bus.events.on('executed', () => viewport.requestRender()),
      session.bus.events.on('undone', () => viewport.requestRender()),
      session.bus.events.on('redone', () => viewport.requestRender()),
    ];

    return () => {
      unsubscribe.forEach((off) => off());
      viewportRef.current = null;
      if (apiRef) apiRef.current = null;
      toolsRef.current = null;
      viewport.dispose();
    };
  }, [session]);

  useEffect(() => {
    const tools = toolsRef.current;
    const byName: Record<ActiveToolName, Tool | null> = {
      pan: null,
      sculpt: tools?.sculpt ?? null,
      water: tools?.water ?? null,
      road: tools?.road ?? null,
      region: tools?.region ?? null,
      poi: tools?.poi ?? null,
      biome: tools?.biome ?? null,
      object: tools?.object ?? null,
      measure: tools?.measure ?? null,
    };
    viewportRef.current?.setTool(byName[activeTool]);
  }, [activeTool, session]);

  useEffect(() => {
    if (toolsRef.current) toolsRef.current.sculpt.brush = brush;
  }, [brush, session]);
  useEffect(() => {
    if (toolsRef.current) toolsRef.current.water.settings = waterSettings;
  }, [waterSettings, session]);
  useEffect(() => {
    if (toolsRef.current) toolsRef.current.road.settings = roadSettings;
  }, [roadSettings, session]);
  useEffect(() => {
    if (toolsRef.current) toolsRef.current.region.settings = regionSettings;
  }, [regionSettings, session]);
  useEffect(() => {
    if (toolsRef.current) toolsRef.current.poi.settings = poiSettings;
  }, [poiSettings, session]);
  useEffect(() => {
    if (toolsRef.current) toolsRef.current.biome.settings = biomeSettings;
  }, [biomeSettings, session]);
  useEffect(() => {
    if (toolsRef.current) toolsRef.current.object.settings = objectSettings;
  }, [objectSettings, session]);

  return <div className="viewport-host" ref={hostRef} />;
}
