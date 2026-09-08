"""Read a saved source and write only to the wrapper's fresh staging directory."""
import json
import math
import sys
from pathlib import Path
import bpy
from mathutils import Matrix, Vector

C = Matrix.Rotation(math.pi / 2, 4, 'X')

def position(obj):
    return list(C.inverted() @ obj.matrix_world.translation)

def transform(obj):
    matrix = C.inverted() @ obj.matrix_world @ C
    loc, quat, scale = matrix.decompose()
    if any(abs(v - 1) > 1e-5 for v in scale):
        raise RuntimeError(f'{obj.name}: apply supported scale before export; non-unit scale is unsupported')
    rebuilt = Matrix.LocRotScale(loc, quat, scale)
    if any(abs(matrix[r][c]-rebuilt[r][c]) > 1e-5 for r in range(4) for c in range(4)):
        raise RuntimeError(f'{obj.name}: shear is unsupported')
    return list(loc), [quat.x, quat.y, quat.z, quat.w]

def mesh_shape(obj):
    mesh = obj.data
    mesh.calc_loop_triangles()
    vertices = [n for v in mesh.vertices for n in (C.inverted().to_3x3() @ v.co)]
    return {'kind':'trimesh', 'vertices':vertices, 'indices':[i for face in mesh.loop_triangles for i in face.vertices]}

def main():
    output = Path(sys.argv[sys.argv.index('--')+1])
    if any(output.iterdir()): raise RuntimeError('Export staging directory must be empty')
    asset = json.loads(bpy.context.scene['asset'])
    for name in ('visuals', 'colliders', 'markers', 'controls'):
        if name not in bpy.data.collections: raise RuntimeError(f'Missing collection {name}')
    expected = {k: {p['id'] for p in asset[k+'s']} for k in ('visual','collider')}
    for kind in ('visual', 'collider'):
        parts = []
        for obj in bpy.data.collections[kind+'s'].objects:
            if obj.type != 'MESH' or obj.modifiers: raise RuntimeError(f'{obj.name}: expected mesh without unapplied modifiers')
            part = json.loads(obj['part'])
            part['position'], part['rotation'] = transform(obj)
            if kind == 'visual':
                if obj.name != part['node']: raise RuntimeError(f'{obj.name}: stable visual node was renamed')
                part['shape'] = mesh_shape(obj)
                if len(obj.data.materials) != 1: raise RuntimeError(f'{obj.name}: expected one visual material')
                mat = obj.data.materials[0]
                if not mat.use_nodes: raise RuntimeError(f'{obj.name}: expected Principled material')
                node = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
                if node is None: raise RuntimeError(f'{obj.name}: missing Principled material')
                rgb = node.inputs['Base Color'].default_value[:3]
                srgb = [round(max(0,min(1,12.92*v if v <= .0031308 else 1.055*v**(1/2.4)-.055))*255) for v in rgb]
                part['material'] = {'color':'#'+''.join(f'{v:02x}' for v in srgb),'metalness':node.inputs['Metallic'].default_value,'roughness':node.inputs['Roughness'].default_value}
            elif part['shape']['kind'] == 'trimesh': part['shape'] = mesh_shape(obj)
            else:
                rest = json.loads(obj['rest_vertices'])
                if len(rest) != len(obj.data.vertices) or any((Vector(v)-obj.data.vertices[i].co).length > 1e-7 for i,v in enumerate(rest)):
                    raise RuntimeError(f'{obj.name}: primitive collider vertex edits cannot preserve its shape tag; edit its transform or explicit dimensions through a supported authoring operation')
            parts.append(part)
        if {p['id'] for p in parts} != expected[kind] or len(parts) != len(expected[kind]):
            raise RuntimeError(f'{kind}: required parts missing, duplicated or replaced')
        asset[kind+'s'] = sorted(parts, key=lambda p: p['id'])
    markers = bpy.data.collections['markers'].objects
    def marker(name):
        if name not in markers: raise RuntimeError(f'Missing required marker: {name}')
        transform(markers[name])
        return position(markers[name])
    for name in ('entry', 'exit'):
        asset['footprint'][name]['position'] = marker(name)
        rotation = C.inverted().to_3x3() @ markers[name].matrix_world.to_quaternion().to_matrix() @ C.to_3x3()
        for axis in ('tangent', 'up'): asset['footprint'][name][axis] = list(rotation @ Vector(asset['footprint'][name][axis]))
    asset['footprint']['route'] = [marker(f'route-{i:04d}') for i in range(len(asset['footprint']['route']))]
    for name in ('min','max'): asset['footprint']['bounds'][name] = marker('bounds-'+name)
    if 'gatePivot' in asset['markers']:
        asset['markers']['gatePivot'] = marker('gate-pivot')
        for part in asset['colliders']:
            if 'motion' in part: part['motion']['pivot'] = asset['markers']['gatePivot']
    if 'finishSensor' in asset['markers']:
        p = marker('finish-sensor')
        sensor = next(p for p in asset['colliders'] if p['id'] == asset['markers']['finishSensor'])
        if (Vector(p)-Vector(sensor['position'])).length > 1e-6: raise RuntimeError('finish-sensor marker must match its collider')
    if 'recoveryBoxes' in asset:
        asset['recoveryBoxes'] = [dict(zip(('position','rotation'), transform(markers[f'recovery-{i:04d}'])), halfExtents=json.loads(markers[f'recovery-{i:04d}']['halfExtents'])) for i in range(len(asset['recoveryBoxes']))]
    bindings = [json.loads(obj['binding']) for obj in bpy.data.collections['controls'].objects]
    if sorted(bindings,key=lambda b:(b['target'],b['partId'])) != sorted(asset['controls'],key=lambda b:(b['target'],b['partId'])):
        raise RuntimeError('Required control bindings changed; preserve the supported structure')
    asset['controls'] = bindings
    bpy.ops.object.select_all(action='DESELECT')
    for obj in bpy.data.collections['visuals'].objects: obj.select_set(True)
    bpy.ops.export_scene.gltf(filepath=str(output/'visuals.glb'), export_format='GLB', use_selection=True, export_yup=True, export_extras=False)
    (output/'asset.json').write_text(json.dumps(asset,allow_nan=False,indent=2)+'\n')

if __name__ == '__main__': main()
