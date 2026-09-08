"""One-time conversion of captured meshes. Never used by normal export."""
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Matrix, Quaternion, Vector

C = Matrix.Rotation(math.pi / 2, 4, 'X')

def vector(v):
    return C.to_3x3() @ Vector(v)

def rotation(q):
    return (C @ Quaternion((q[3], q[0], q[1], q[2])).to_matrix().to_4x4() @ C.inverted()).to_quaternion()

def create_mesh(name, data, collection):
    mesh = bpy.data.meshes.new(name)
    vertices = [vector(data['vertices'][i:i+3]) for i in range(0, len(data['vertices']), 3)]
    indices = data['indices']
    mesh.from_pydata(vertices, [], [indices[i:i+3] for i in range(0, len(indices), 3)])
    mesh.update()
    if data['uv'] is not None:
        uv = mesh.uv_layers.new(name='UVMap')
        for loop in mesh.loops:
            uv.data[loop.index].uv = data['uv'][loop.vertex_index*2:loop.vertex_index*2+2]
    for face in mesh.polygons:
        face.use_smooth = True
    mesh.normals_split_custom_set_from_vertices([vector(data['normals'][i:i+3]) for i in range(0, len(data['normals']), 3)])
    obj = bpy.data.objects.new(name, mesh)
    collection.objects.link(obj)
    return obj

def material(data):
    mat = bpy.data.materials.new('surface')
    mat.use_nodes = True
    rgb = [int(data['color'][i:i+2], 16) / 255 for i in (1, 3, 5)]
    linear = [v/12.92 if v <= .04045 else ((v+.055)/1.055)**2.4 for v in rgb]
    node = mat.node_tree.nodes.get('Principled BSDF')
    node.inputs['Base Color'].default_value = (*linear, 1)
    node.inputs['Metallic'].default_value = data['metalness']
    node.inputs['Roughness'].default_value = data['roughness']
    return mat

def main():
    args = sys.argv[sys.argv.index('--')+1:]
    source, output = map(Path, args)
    if output.exists():
        raise RuntimeError(f'Refusing existing Blender source: {output}')
    captured = json.loads(source.read_text())
    asset = captured['asset']
    bpy.ops.wm.read_factory_settings(use_empty=True)
    collections = {}
    for name in ('visuals', 'colliders', 'markers', 'controls'):
        collection = bpy.data.collections.new(name)
        bpy.context.scene.collection.children.link(collection)
        collections[name] = collection
    bpy.context.scene['asset'] = json.dumps(asset)
    bpy.context.scene.unit_settings.system = 'METRIC'
    bpy.context.scene.unit_settings.scale_length = 1
    for kind, meshes in [('visual', captured['meshes']), ('collider', captured['colliderMeshes'])]:
        for part in asset[kind+'s']:
            name = part['id'] if kind == 'visual' else 'collision__'+part['id']
            obj = create_mesh(name, meshes[part['id']], collections[kind+'s'])
            obj.location = vector(part['position'])
            obj.rotation_mode = 'QUATERNION'
            obj.rotation_quaternion = rotation(part['rotation'])
            obj['part'] = json.dumps(part)
            obj['rest_vertices'] = json.dumps([list(v.co) for v in obj.data.vertices])
            if kind == 'visual': obj.data.materials.append(material(part['material']))
            else: obj.hide_render = True; obj.display_type = 'WIRE'
    def marker(name, position):
        obj = bpy.data.objects.new(name, None)
        collections['markers'].objects.link(obj)
        obj.location = vector(position)
        obj['rest_position'] = json.dumps(position)
        obj.empty_display_size = .03
        return obj
    for name in ('entry', 'exit'):
        marker(name, asset['footprint'][name]['position'])
    for i, point in enumerate(asset['footprint']['route']): marker(f'route-{i:04d}', point)
    for name in ('min', 'max'): marker('bounds-'+name, asset['footprint']['bounds'][name])
    if 'gatePivot' in asset['markers']: marker('gate-pivot', asset['markers']['gatePivot'])
    if 'finishSensor' in asset['markers']:
        part = next(p for p in asset['colliders'] if p['id'] == asset['markers']['finishSensor'])
        marker('finish-sensor', part['position'])
    for i, box in enumerate(asset.get('recoveryBoxes', [])):
        obj = marker(f'recovery-{i:04d}', box['position'])
        obj.rotation_mode = 'QUATERNION'; obj.rotation_quaternion = rotation(box['rotation'])
        obj['halfExtents'] = json.dumps(box['halfExtents'])
    for i, binding in enumerate(asset['controls']):
        obj = bpy.data.objects.new(f'binding-{i:04d}', None)
        collections['controls'].objects.link(obj)
        obj['binding'] = json.dumps(binding)
    if asset['id'] == 'marble':
        styles = json.loads((source.parent / 'marble-styles.json').read_text())
        # Keep the exact live UV topology; identity-specific skins remain game-owned data.
        obj = bpy.data.objects['marble']
        old = obj.data
        replacement = create_mesh('marble_uv', styles[0]['geometry'], collections['visuals'])
        obj.data = replacement.data
        bpy.data.objects.remove(replacement, do_unlink=True)
        obj.data.materials.append(material(asset['visuals'][0]['material']))
        bpy.data.meshes.remove(old)
        bpy.context.scene['marble_styles'] = json.dumps(styles)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Reserve without clobbering, including another bootstrap racing this process.
    fd = os.open(output, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    os.close(fd)
    bpy.ops.wm.save_as_mainfile(filepath=str(output.resolve()), check_existing=False)

if __name__ == '__main__': main()
