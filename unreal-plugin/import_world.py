"""Importador do World-Esquematics para a Unreal Engine 5.

Le o pacote exportado pelo editor (heightmap.r16, weightmaps/*.png,
objects.json, scatter.csv, splines.json, water.json, metadata.json,
unreal_import.json) e monta a cena no editor da Unreal.

Uso DENTRO do editor (plugin "Python Editor Script Plugin" habilitado):

    import import_world
    import_world.run(r"C:/caminho/para/o/export", assets="assets.json")

Uso FORA do editor (validacao, CI) — calcula tudo e escreve o plano sem
tocar na engine:

    python3 import_world.py --bundle <dir> --dry-run --plan-out plan.json

Arquitetura: build_plan() e PURO (dados -> plano de acoes, testavel em
qualquer Python); apply_plan() e a unica parte que importa `unreal`.
O Landscape em si nao e criavel via Python de forma confiavel — o plugin
imprime os valores EXATOS para o dialogo de import (resolucao, escalas,
localizacao) e, se ja houver um Landscape no level, confere/ajusta escala
e posicao. Todo o resto (objetos, vegetacao, POIs, agua, splines) e
automatizado.
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
from pathlib import Path

SUPPORTED_FORMAT_VERSIONS = (1, 2)

# malha padrao por tipo quando nao ha assets.json (placeholders da engine)
DEFAULT_MESH = "/Engine/BasicShapes/Cylinder.Cylinder"
DEFAULT_ASSET_MAP = {
    "pine_tree_01": "/Engine/BasicShapes/Cone.Cone",
    "oak_tree_01": "/Engine/BasicShapes/Cone.Cone",
    "bush_01": "/Engine/BasicShapes/Sphere.Sphere",
}


# ---------------------------------------------------------------- leitura

def load_bundle(bundle_dir):
    """Le e valida o pacote exportado. Puro (sem engine)."""
    bundle = Path(bundle_dir)
    manifest_path = bundle / "unreal_import.json"
    if not manifest_path.is_file():
        raise SystemExit(f"unreal_import.json nao encontrado em {bundle}")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))

    version = manifest.get("formatVersion")
    if version not in SUPPORTED_FORMAT_VERSIONS:
        raise SystemExit(
            f"formatVersion {version} nao suportado por este importador "
            f"(suportados: {SUPPORTED_FORMAT_VERSIONS}). Atualize o plugin."
        )

    def read_json(name, fallback):
        path = bundle / name
        if not path.is_file():
            return fallback
        return json.loads(path.read_text(encoding="utf-8"))

    scatter_rows = []
    scatter_path = bundle / manifest.get("files", {}).get("scatter", "scatter.csv")
    if scatter_path.is_file():
        with scatter_path.open(newline="", encoding="utf-8") as handle:
            scatter_rows = list(csv.DictReader(handle))

    heightmap = bundle / manifest["landscape"]["heightmapFile"]
    if not heightmap.is_file():
        raise SystemExit(f"heightmap ausente: {heightmap}")
    expected = manifest["landscape"]["resolutionX"] * manifest["landscape"]["resolutionY"] * 2
    actual = heightmap.stat().st_size
    if actual != expected:
        raise SystemExit(
            f"heightmap.r16 com {actual} bytes; esperado {expected} "
            f"({manifest['landscape']['resolutionX']}x{manifest['landscape']['resolutionY']} uint16)"
        )

    files = manifest.get("files", {})
    return {
        "dir": bundle,
        "manifest": manifest,
        "objects": read_json(files.get("objects", "objects.json"), {"objects": []}),
        "splines": read_json(files.get("splines", "splines.json"), {"nodes": [], "splines": []}),
        "water": read_json(files.get("water", "water.json"), None),
        "metadata": read_json(files.get("metadata", "metadata.json"), {"regions": [], "pois": []}),
        "scatter": scatter_rows,
    }


# ------------------------------------------------------------------ plano

def bezier_to_spline_points(points):
    """Bezier cubica (p0,c1,c2,p1) -> 2 pontos de spline com tangentes.

    A hermite da Unreal com tangente de saida 3*(c1-p0) e de chegada
    3*(p1-c2) reproduz exatamente a bezier.
    """
    p0, c1, c2, p1 = points
    tangent_out = {k: 3.0 * (c1[k] - p0[k]) for k in ("x", "y", "z")}
    tangent_in = {k: 3.0 * (p1[k] - c2[k]) for k in ("x", "y", "z")}
    return [
        {"position": p0, "tangent": tangent_out},
        {"position": p1, "tangent": tangent_in},
    ]


def build_plan(bundle, asset_map=None, max_scatter=None):
    """Transforma o pacote num plano de acoes. Puro (sem engine)."""
    assets = dict(DEFAULT_ASSET_MAP)
    assets.update(asset_map or {})
    manifest = bundle["manifest"]
    warnings = []

    spawns = []
    for obj in bundle["objects"].get("objects", []):
        spawns.append({
            "kind": "object",
            "type": obj["type"],
            "asset": assets.get(obj["type"], DEFAULT_MESH),
            "location": obj["position"],
            "yaw_deg": obj["yaw_deg"],
            "scale": obj["scale"],
            "tags": obj.get("tags", []),
        })

    scatter_rows = bundle["scatter"]
    total_scatter = len(scatter_rows)
    if max_scatter is not None and total_scatter > max_scatter:
        warnings.append(
            f"scatter.csv tem {total_scatter} instancias; importando as primeiras "
            f"{max_scatter} (--max-scatter). Para vegetacao em massa use foliage/HISM."
        )
        scatter_rows = scatter_rows[:max_scatter]
    for row in scatter_rows:
        spawns.append({
            "kind": "vegetation",
            "type": row["type"],
            "asset": assets.get(row["type"], DEFAULT_MESH),
            "location": {"x": float(row["x"]), "y": float(row["y"]), "z": float(row["z"])},
            "yaw_deg": float(row["yaw"]),
            "scale": {"x": float(row["scale"]), "y": float(row["scale"]), "z": float(row["scale"])},
            "tags": [],
        })

    for poi in bundle["metadata"].get("pois", []):
        spawns.append({
            "kind": "poi",
            "type": "poi",
            "asset": None,  # TargetPoint
            "label": f"{poi.get('icon', '')} {poi['name']}".strip(),
            "location": poi["position"],
            "yaw_deg": 0.0,
            "scale": {"x": 1, "y": 1, "z": 1},
            "tags": [],
        })

    roads = []
    for spline in bundle["splines"].get("splines", []):
        roads.append({
            "id": spline["id"],
            "type": spline["type"],
            "material": spline["material"],
            "width_uu": spline["width_uu"],
            "points": bezier_to_spline_points(spline["points"]),
        })

    landscape = dict(manifest["landscape"])
    landscape["instructions"] = (
        "Landscape Mode > Import from File: selecione o heightmap.r16 "
        f"({landscape['resolutionX']}x{landscape['resolutionY']}), "
        f"Scale X/Y/Z = {landscape['scale']['x']:.2f} / {landscape['scale']['y']:.2f} / "
        f"{landscape['scale']['z']:.2f}, Location = ({landscape['location']['x']:.0f}, "
        f"{landscape['location']['y']:.0f}, {landscape['location']['z']:.0f}). "
        "Depois adicione as weightmaps como Layers (1 PNG por bioma)."
    )

    return {
        "formatVersion": manifest["formatVersion"],
        "project": manifest.get("source", {}).get("projectName", ""),
        "landscape": landscape,
        "weightmaps": manifest.get("weightmaps", []),
        "spawns": spawns,
        "roads": roads,
        "water": bundle["water"],
        "regions": bundle["metadata"].get("regions", []),
        "warnings": warnings,
        "counts": {
            "spawns": len(spawns),
            "scatterTotal": total_scatter,
            "roads": len(roads),
        },
    }


# ------------------------------------------------------------------ engine

def apply_plan(plan, road_bp=None):  # pragma: no cover - requer o editor
    """Executa o plano dentro do editor da Unreal (unica parte com engine)."""
    import unreal

    actors = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)

    # 1. Landscape: nao ha API Python confiavel para criar; conferimos.
    unreal.log(plan["landscape"]["instructions"])
    landscapes = [
        a for a in actors.get_all_level_actors() if isinstance(a, unreal.LandscapeProxy)
    ]
    scale = plan["landscape"]["scale"]
    location = plan["landscape"]["location"]
    if landscapes:
        landscape = landscapes[0]
        landscape.set_actor_scale3d(unreal.Vector(scale["x"], scale["y"], scale["z"]))
        landscape.set_actor_location(
            unreal.Vector(location["x"], location["y"], location["z"]), False, False
        )
        unreal.log("Landscape existente: escala e posicao ajustadas ao manifest.")
    else:
        unreal.log_warning(
            "Nenhum Landscape no level. Importe o heightmap com os valores acima e rode de novo."
        )

    # 2. Objetos, vegetacao e POIs
    mesh_cache = {}

    def mesh_for(asset_path):
        if asset_path not in mesh_cache:
            mesh_cache[asset_path] = unreal.EditorAssetLibrary.load_asset(asset_path)
        return mesh_cache[asset_path]

    spawned = 0
    with unreal.ScopedSlowTask(len(plan["spawns"]), "World-Esquematics: spawns") as task:
        task.make_dialog(True)
        for spawn in plan["spawns"]:
            if task.should_cancel():
                break
            task.enter_progress_frame(1)
            loc = unreal.Vector(
                spawn["location"]["x"], spawn["location"]["y"], spawn["location"]["z"]
            )
            rot = unreal.Rotator(0.0, 0.0, spawn["yaw_deg"])  # roll, pitch, yaw
            if spawn["kind"] == "poi":
                actor = actors.spawn_actor_from_class(unreal.TargetPoint, loc, rot)
                actor.set_actor_label(spawn["label"])
            else:
                actor = actors.spawn_actor_from_class(unreal.StaticMeshActor, loc, rot)
                actor.set_actor_label(f"{spawn['kind']}_{spawn['type']}_{spawned}")
                mesh = mesh_for(spawn["asset"])
                if mesh:
                    actor.static_mesh_component.set_static_mesh(mesh)
                actor.set_actor_scale3d(
                    unreal.Vector(spawn["scale"]["x"], spawn["scale"]["y"], spawn["scale"]["z"])
                )
                for tag in spawn.get("tags", []):
                    actor.tags.append(unreal.Name(tag))
            spawned += 1
    unreal.log(f"{spawned} atores criados (objetos, vegetacao, POIs).")

    # 3. Estradas: com um Blueprint com SplineComponent (--road-bp), criamos
    #    as splines; sem ele, so avisamos (Landscape Splines nao tem API Python).
    if plan["roads"]:
        bp_class = unreal.EditorAssetLibrary.load_blueprint_class(road_bp) if road_bp else None
        if bp_class is None:
            unreal.log_warning(
                f"{len(plan['roads'])} estradas no plano. Passe road_bp='/Game/SeuBP' "
                "(Blueprint com um SplineComponent) para cria-las automaticamente."
            )
        else:
            for road in plan["roads"]:
                first = road["points"][0]["position"]
                actor = actors.spawn_actor_from_class(
                    bp_class, unreal.Vector(first["x"], first["y"], first["z"])
                )
                actor.set_actor_label(f"road_{road['type']}_{road['id'][:8]}")
                spline = actor.get_component_by_class(unreal.SplineComponent)
                spline.clear_spline_points(True)
                for index, point in enumerate(road["points"]):
                    pos = point["position"]
                    tan = point["tangent"]
                    spline.add_spline_point(
                        unreal.Vector(pos["x"], pos["y"], pos["z"]),
                        unreal.SplineCoordinateSpace.WORLD,
                        True,
                    )
                    spline.set_tangent_at_spline_point(
                        index,
                        unreal.Vector(tan["x"], tan["y"], tan["z"]),
                        unreal.SplineCoordinateSpace.WORLD,
                        True,
                    )
            unreal.log(f"{len(plan['roads'])} splines de estrada criadas.")

    # 4. Agua: cotas e poligonos ficam no log (Water Body Custom e manual
    #    ou via plugin Water — as classes variam por versao da engine).
    if plan["water"]:
        ocean = plan["water"]["ocean"]
        unreal.log(
            f"Agua: mar na cota Z={ocean['surfaceZ_uu']:.0f} uu; "
            f"{len(plan['water']['lakes'])} lagos e {len(plan['water']['rivers'])} rios "
            "em water.json (cotas e poligonos em uu)."
        )

    for warning in plan["warnings"]:
        unreal.log_warning(warning)


# --------------------------------------------------------------- interface

def run(bundle_dir, assets=None, max_scatter=50000, road_bp=None):
    """Ponto de entrada para uso dentro do editor."""
    asset_map = None
    if assets:
        asset_map = json.loads(Path(assets).read_text(encoding="utf-8"))
    bundle = load_bundle(bundle_dir)
    plan = build_plan(bundle, asset_map=asset_map, max_scatter=max_scatter)
    apply_plan(plan, road_bp=road_bp)
    return plan


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--bundle", required=True, help="pasta com o export do World-Esquematics")
    parser.add_argument("--assets", help="JSON mapeando type -> asset path da engine")
    parser.add_argument("--max-scatter", type=int, default=50000)
    parser.add_argument("--road-bp", help="Blueprint com SplineComponent para as estradas")
    parser.add_argument("--dry-run", action="store_true", help="so calcula o plano (sem engine)")
    parser.add_argument("--plan-out", help="escreve o plano calculado neste JSON")
    args = parser.parse_args(argv)

    asset_map = None
    if args.assets:
        asset_map = json.loads(Path(args.assets).read_text(encoding="utf-8"))

    bundle = load_bundle(args.bundle)
    plan = build_plan(bundle, asset_map=asset_map, max_scatter=args.max_scatter)

    if args.plan_out:
        Path(args.plan_out).write_text(
            json.dumps(plan, indent=2, ensure_ascii=False), encoding="utf-8"
        )
    print(
        f"Plano: {plan['counts']['spawns']} spawns "
        f"({plan['counts']['scatterTotal']} instancias de vegetacao no CSV), "
        f"{plan['counts']['roads']} estradas. Landscape "
        f"{plan['landscape']['resolutionX']}x{plan['landscape']['resolutionY']} "
        f"ZScale {plan['landscape']['scale']['z']:.2f}."
    )
    for warning in plan["warnings"]:
        print(f"AVISO: {warning}")

    if not args.dry_run:
        apply_plan(plan, road_bp=args.road_bp)
    return 0


if __name__ == "__main__":
    sys.exit(main())
