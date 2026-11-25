# Aquarium decorations rendered to transparent sprites.
# Run: blender -b -P decor.py -- [--only name,name]
import bpy, sys, os, math, argparse
import numpy as np
from mathutils import Vector, noise

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
ap = argparse.ArgumentParser()
ap.add_argument('--only', default='')
ap.add_argument('--out', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'render', 'decor'))
args = ap.parse_args(argv)
ONLY = set(filter(None, args.only.split(',')))
PPU = 700
TAU = 2 * math.pi
SWAY_FRAMES = 8
os.makedirs(args.out, exist_ok=True)
sstep = lambda a, b, x: (lambda t: t * t * (3 - 2 * t))(np.clip((x - a) / (b - a), 0, 1))


# ------------------------------------------------------------------ scene
def reset(frame_w, frame_h, cz, ppu=PPU, tilt=0.):
    for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.curves, bpy.data.lights, bpy.data.cameras):
        for o in list(coll):
            coll.remove(o)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.samples = 64
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.resolution_x, sc.render.resolution_y = int(frame_w * ppu), int(frame_h * ppu)
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.view_settings.view_transform = 'Standard'
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = max(frame_w, frame_h)
    cam.location = (0, -8, cz + 8 * math.tan(tilt))
    cam.rotation_euler = (math.pi / 2 - tilt, 0, 0)
    sc.collection.objects.link(cam)
    sc.camera = cam
    if not sc.world:
        sc.world = bpy.data.worlds.new('w')
    sc.world.use_nodes = True
    bg = sc.world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (.55, .68, .78, 1)
    bg.inputs['Strength'].default_value = .5
    for name, rot, e, colr in (('key', (math.radians(30), 0, math.radians(-15)), 2.6, (1, .97, .9)),
                               ('fill', (math.radians(80), 0, math.radians(30)), .5, (.85, .92, 1))):
        l = bpy.data.objects.new(name, bpy.data.lights.new(name, 'SUN'))
        l.data.energy, l.data.color, l.data.angle = e, colr, math.radians(20)
        l.rotation_euler = rot
        sc.collection.objects.link(l)


def render(name):
    bpy.context.scene.render.filepath = os.path.join(args.out, name + '.png')
    bpy.ops.render.render(write_still=True)


def link(ob):
    bpy.context.scene.collection.objects.link(ob)
    return ob


def want(name):
    return not ONLY or name in ONLY


# -------------------------------------------------------------- materials
def mat_attr(name, rough=.45, metal=0., sss=0., bump_scale=0., bump_strength=.3):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    a = nt.nodes.new('ShaderNodeAttribute')
    a.attribute_name = 'Col'
    nt.links.new(a.outputs['Color'], b.inputs['Base Color'])
    nt.links.new(a.outputs['Alpha'], b.inputs['Alpha'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if sss:
        b.inputs['Subsurface Weight'].default_value = sss
        b.inputs['Subsurface Radius'].default_value = (.02, .05, .01)
    if bump_scale:
        t = nt.nodes.new('ShaderNodeTexNoise')
        t.inputs['Scale'].default_value = bump_scale
        t.inputs['Detail'].default_value = 8
        bn = nt.nodes.new('ShaderNodeBump')
        bn.inputs['Strength'].default_value = bump_strength
        bn.inputs['Distance'].default_value = .01
        nt.links.new(t.outputs['Fac'], bn.inputs['Height'])
        nt.links.new(bn.outputs['Normal'], b.inputs['Normal'])
    return m


def mat_noise(name, c1, c2, scale=6., rough=.8, bump=.6, bump_scale=30., metal=0.):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    b = next(n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED')
    tc = nt.nodes.new('ShaderNodeTexCoord')
    t = nt.nodes.new('ShaderNodeTexNoise')
    t.inputs['Scale'].default_value = scale
    t.inputs['Detail'].default_value = 10
    nt.links.new(tc.outputs['Object'], t.inputs['Vector'])
    r = nt.nodes.new('ShaderNodeValToRGB')
    r.color_ramp.elements[0].position, r.color_ramp.elements[1].position = .3, .7
    r.color_ramp.elements[0].color, r.color_ramp.elements[1].color = (*c1, 1), (*c2, 1)
    nt.links.new(t.outputs['Fac'], r.inputs['Fac'])
    nt.links.new(r.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    t2 = nt.nodes.new('ShaderNodeTexNoise')
    t2.inputs['Scale'].default_value = bump_scale
    t2.inputs['Detail'].default_value = 12
    nt.links.new(tc.outputs['Object'], t2.inputs['Vector'])
    bn = nt.nodes.new('ShaderNodeBump')
    bn.inputs['Strength'].default_value = bump
    bn.inputs['Distance'].default_value = .02
    nt.links.new(t2.outputs['Fac'], bn.inputs['Height'])
    nt.links.new(bn.outputs['Normal'], b.inputs['Normal'])
    return m


def mat_plain(name, col, rough=.5, metal=0., alpha=1., emit=0., transmission=0.):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    b.inputs['Base Color'].default_value = (*col, 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    b.inputs['Alpha'].default_value = alpha
    if transmission:
        b.inputs['Transmission Weight'].default_value = transmission
    if emit:
        b.inputs['Emission Color'].default_value = (*col, 1)
        b.inputs['Emission Strength'].default_value = emit
    return m


def mesh_obj(name, verts, faces, mat, col=None, smooth=True):
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(v) for v in verts], [], faces)
    if smooth:
        me.polygons.foreach_set('use_smooth', [True] * len(me.polygons))
    if col is not None:
        ca = me.color_attributes.new('Col', 'FLOAT_COLOR', 'POINT')
        ca.data.foreach_set('color', np.asarray(col, dtype=np.float32).ravel())
    me.materials.append(mat)
    return link(bpy.data.objects.new(name, me))


def grid_faces(nu, nv, off=0):
    return [(off + i * nv + j, off + i * nv + j + 1, off + (i + 1) * nv + j + 1, off + (i + 1) * nv + j)
            for i in range(nu - 1) for j in range(nv - 1)]


def prim(kind, mat, loc, scale=(1, 1, 1), rot=(0, 0, 0), **kw):
    getattr(bpy.ops.mesh, 'primitive_' + kind + '_add')(location=loc, rotation=rot, **kw)
    ob = bpy.context.active_object
    ob.scale = scale
    ob.data.materials.append(mat)
    if kind != 'cube':
        bpy.ops.object.shade_smooth()
    return ob


# ------------------------------------------------------------------ rocks
def rock(name, seed, c1, c2, sx=1., sz=.62, frame=(.62, .46)):
    reset(frame[0], frame[1], frame[1] / 2 - .02)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=5, radius=.25)
    ob = bpy.context.active_object
    off = Vector((seed * 13.1, seed * 7.7, seed * 3.3))
    for v in ob.data.vertices:
        p = v.co.normalized()
        d = noise.fractal(p * 1.3 + off, 1.0, 2.0, 5) * .32 + noise.noise(p * 6 + off) * .04
        co = p * (.25 * (1 + d))
        co.x *= sx
        co.z = max(co.z * sz, -.05) + .05
        co.y *= .8
        v.co = co
    bpy.ops.object.shade_smooth()
    ob.data.materials.append(mat_noise(name, c1, c2, scale=5, bump_scale=38))
    render(name)


# -------------------------------------------------------------- driftwood
def driftwood(name, seed, frame=(1.0, .7)):
    reset(frame[0], frame[1], frame[1] / 2 - .02)
    g = np.random.default_rng(seed)
    mat = mat_noise(name, (.20, .11, .05), (.42, .27, .14), scale=9, rough=.85, bump=.9, bump_scale=55)
    cu = bpy.data.curves.new(name, 'CURVE')
    cu.dimensions = '3D'
    cu.bevel_depth = 1.0
    cu.bevel_resolution = 5
    cu.use_fill_caps = True

    def branch(start, ang, length, r0, depth):
        n = 26
        pts, p, a, yy = [], np.array(start, float), ang, 0.
        wob = g.uniform(-1, 1, 3)
        for i in range(n):
            t = i / (n - 1)
            pts.append((p[0], p[1], p[2], r0 * (1 - .8 * t) ** .8 + .004))
            a += (wob[0] * math.sin(t * 5 + wob[1] * 3) * .12 + g.normal(0, .03))
            p = p + np.array([math.cos(a), wob[2] * .15 * math.cos(t * 4), math.sin(a)]) * length / n
            if depth and i in (9, 15, 20) and g.random() < .8:
                branch(p, a + g.choice([-1, 1]) * g.uniform(.4, .8), length * g.uniform(.28, .42), r0 * (1 - .8 * t) * .7, depth - 1)
        sp = cu.splines.new('POLY')
        sp.points.add(len(pts) - 1)
        for q, (x, y, z, r) in zip(sp.points, pts):
            q.co = (x, y, z, 1)
            q.radius = r
    branch((-.42, 0, .05), .12, .78, .045, 2)
    branch((-.30, .03, .04), .75, .3, .028, 1)
    ob = link(bpy.data.objects.new(name, cu))
    cu.materials.append(mat)
    render(name)


# ----------------------------------------------------------------- plants
def leaf_mesh(base, length, width, theta0, curl, yaw, shape, col_fn, sway, nu=22, nv=5, stem=0.):
    t = np.linspace(0, 1, nu)
    th = theta0 + curl * t ** 1.5 + sway * t ** 1.6
    ds = length / (nu - 1)
    cx = base[0] + np.concatenate([[0], np.cumsum(np.sin(th[:-1]) * ds)])
    cz = base[2] + np.concatenate([[0], np.cumsum(np.cos(th[:-1]) * ds)])
    w = width * shape(t)
    v = np.linspace(-1, 1, nv)
    T, Vv = np.meshgrid(t, v, indexing='ij')
    W = np.repeat(w[:, None], nv, 1)
    TH = np.repeat(th[:, None], nv, 1)
    # blade width runs across the leaf; yaw turns it partly edge-on, fold adds a V section
    ox = np.cos(TH) * W * Vv * math.cos(yaw)
    oz = -np.sin(TH) * W * Vv * math.cos(yaw)
    oy = base[1] + W * Vv * math.sin(yaw) + np.abs(Vv) * W * .35
    verts = np.stack([np.repeat(cx[:, None], nv, 1) + ox, oy, np.repeat(cz[:, None], nv, 1) + oz], -1).reshape(-1, 3)
    return verts, col_fn(T.ravel(), Vv.ravel()), (cx, cz, th)


def plant(name, frame, build, frames=SWAY_FRAMES):
    mat = mat_attr(name, rough=.38, sss=.25, bump_scale=60, bump_strength=.15)
    for f in range(frames):
        reset(frame[0], frame[1], frame[1] / 2 - .02)
        verts, cols, faces = [], [], []
        for (v, c, nu, nv) in build(f / frames):
            faces += grid_faces(nu, nv, sum(len(x) for x in verts))
            verts.append(v)
            cols.append(c)
        mesh_obj(name, np.concatenate(verts), faces, mat, np.concatenate(cols))
        render(f'{name}_{f:02d}')


def green(g, base, tip, rib=.12, alpha=1.):
    jitter = g.uniform(.82, 1.12)
    b, tp = np.array(base) * jitter, np.array(tip) * jitter

    def fn(t, v):
        c = b + (tp - b) * t[:, None]
        c = c * (1 + rib * (1 - np.abs(v)) ** 4)[:, None] * (1 - .12 * np.sin(v * 9) ** 2)[:, None]
        return np.concatenate([np.clip(c, 0, 1), np.full((len(t), 1), alpha)], 1)
    return fn


def vallisneria(ph):
    g = np.random.default_rng(1)
    for i in range(16):
        L = g.uniform(.7, 1.05)
        sw = .16 * math.sin(TAU * ph + g.uniform(0, 2)) + .05 * math.sin(2 * TAU * ph + i)
        v, c, _ = leaf_mesh((g.uniform(-.07, .07), g.uniform(-.03, .03), 0), L, .017, g.uniform(-.14, .14), g.uniform(-.35, .35),
                            g.uniform(-.9, .9), lambda t: np.minimum(1, (1 - t) * 14 + .15) * (.7 + .3 * np.minimum(1, t * 8)),
                            green(g, (.10, .32, .06), (.30, .58, .12)), sw, nu=40)
        yield v, c, 40, 5


def sword(ph):
    g = np.random.default_rng(2)
    for i in range(13):
        L = g.uniform(.32, .6)
        th0 = g.uniform(-.75, .75)
        sw = .09 * math.sin(TAU * ph + g.uniform(0, 2))
        shape = lambda t: np.where(t < .32, .1, np.sin(np.clip((t - .32) / .68, 0, 1) * math.pi) ** .7 + .02)
        v, c, _ = leaf_mesh((g.uniform(-.03, .03), g.uniform(-.03, .03), 0), L, .048, th0, np.sign(th0) * g.uniform(.2, .6),
                            g.uniform(-.7, .7), shape, green(g, (.08, .30, .05), (.22, .50, .10), rib=.3), sw, nu=30)
        yield v, c, 30, 5


def anubias(ph):
    g = np.random.default_rng(3)
    for i in range(9):
        L = g.uniform(.15, .27)
        th0 = g.uniform(-1.05, 1.05)
        sw = .05 * math.sin(TAU * ph + g.uniform(0, 2))
        shape = lambda t: np.where(t < .42, .09, np.sin(np.clip((t - .42) / .58, 0, 1) * math.pi) ** .55 + .02)
        v, c, _ = leaf_mesh((g.uniform(-.06, .06), g.uniform(-.03, .03), .01), L, .06, th0, np.sign(th0) * g.uniform(.3, .7),
                            g.uniform(-.6, .6), shape, green(g, (.04, .20, .05), (.08, .30, .07), rib=.35), sw, nu=26)
        yield v, c, 26, 5


def rotala(ph):
    g = np.random.default_rng(4)
    for i in range(7):
        L = g.uniform(.5, .82)
        bx = g.uniform(-.14, .14)
        sw = .14 * math.sin(TAU * ph + g.uniform(0, 2.5))
        by = g.uniform(-.03, .03)
        v, c, (cx, cz, th) = leaf_mesh((bx, by, 0), L, .006, g.uniform(-.12, .12), g.uniform(-.25, .25), 0,
                                       lambda t: np.ones_like(t), green(g, (.25, .30, .10), (.45, .25, .15), rib=0), sw, nu=48, nv=3)
        yield v, c, 48, 3
        for k in range(4, 48, 2):
            t = k / 47
            tipc = np.array([.20, .46, .10]) * (1 - t) + np.array([.72, .22, .20]) * t
            for side in (-1, 1):
                lv, lc, _ = leaf_mesh((cx[k], by + side * .004, cz[k]), .04 + .02 * (1 - abs(t - .7)), .009,
                                      th[k] + side * (1.15 + .15 * math.sin(k)), side * .25, g.uniform(-.5, .5),
                                      lambda q: np.sin(q * math.pi) ** .6 + .05,
                                      green(g, tipc * .8, tipc * 1.15, rib=.25), 0, nu=7, nv=3)
                yield lv, lc, 7, 3


def hairgrass(ph):
    g = np.random.default_rng(5)
    for i in range(130):
        bx = g.uniform(-.42, .42)
        sw = .25 * math.sin(TAU * ph + bx * 5 + g.uniform(0, .8))
        v, c, _ = leaf_mesh((bx, g.uniform(-.05, .05), 0), g.uniform(.05, .13) * (1 - .5 * (abs(bx) / .42) ** 3), .0028,
                            g.uniform(-.35, .35), g.uniform(-.4, .4), 0, lambda t: 1 - .8 * t,
                            green(g, (.10, .34, .06), (.32, .62, .14), rib=0), sw, nu=8, nv=3)
        yield v, c, 8, 3


# -------------------------------------------------------------- ornaments
def castle():
    reset(.62, .66, .31)
    stone = mat_noise('stone', (.42, .40, .36), (.66, .63, .56), scale=14, rough=.9, bump=.8, bump_scale=70)
    dark = mat_plain('dark', (.02, .02, .025), rough=1)
    roof = mat_noise('roof', (.28, .12, .09), (.45, .2, .14), scale=20, rough=.8, bump=.6, bump_scale=90)
    for x, h, r in ((-.17, .40, .075), (.17, .32, .07), (0, .22, .0)):
        if r:
            prim('cylinder', stone, (x, 0, h / 2), (r, r, h / 2), vertices=40, radius=1, depth=2)
            prim('cylinder', stone, (x, 0, h + .012), (r * 1.18, r * 1.18, .022), vertices=40, radius=1, depth=2)
            prim('cone', roof, (x, 0, h + .034 + .07), (r * 1.1, r * 1.1, .07), vertices=40, radius1=1, radius2=0, depth=2)
            prim('cube', dark, (x, -r * .98, h * .68), (.014, .01, .028), size=2)
    prim('cube', stone, (0, .01, .11), (.17, .06, .11), size=2)
    for k in range(-4, 5):
        prim('cube', stone, (k * .036, .01, .232), (.011, .06, .014), size=2)
    prim('cube', dark, (0, -.052, .06), (.04, .01, .06), size=2)
    prim('cylinder', dark, (0, -.052, .12), (.04, .04, .01), rot=(math.pi / 2, 0, 0), vertices=32, radius=1, depth=2)
    render('castle')


def pot():
    reset(.5, .36, .17)
    clay = mat_noise('clay', (.50, .23, .12), (.68, .36, .20), scale=10, rough=.85, bump=.4, bump_scale=60)
    prof = [(0, .001), (.02, .09), (.10, .125), (.20, .12), (.28, .085), (.31, .07), (.33, .085), (.335, .08), (.31, .062), (.28, .075),
            (.2, .108), (.1, .112), (.03, .08), (.02, .001)]
    hs = np.array([p[0] for p in prof]); rs = np.array([p[1] for p in prof])
    nu, nv = len(prof), 48
    ang = np.linspace(0, TAU, nv)
    verts = np.stack([np.repeat(hs[:, None], nv, 1), rs[:, None] * np.cos(ang)[None], rs[:, None] * np.sin(ang)[None]], -1).reshape(-1, 3)
    ob = mesh_obj('pot', verts, grid_faces(nu, nv), clay)
    ob.rotation_euler = (0, math.radians(-8), math.radians(-38))
    ob.location = (-.12, 0, .125)
    render('pot')


# -------------------------------------------------------------- equipment
def heater(on):
    reset(.12, .40, .19)
    glass = mat_plain('glass', (.9, .95, 1), rough=.03, transmission=1., alpha=.35)
    black = mat_plain('black', (.02, .02, .02), rough=.4)
    core = mat_plain('core', (.85, .8, .7), rough=.6)
    coil = mat_plain('coil', (1, .35, .08) if on else (.35, .25, .2), rough=.5, emit=3 if on else 0)
    prim('cylinder', glass, (0, 0, .17), (.018, .018, .15), vertices=32, radius=1, depth=2)
    prim('cylinder', core, (0, 0, .15), (.011, .011, .11), vertices=24, radius=1, depth=2)
    prim('cylinder', coil, (0, 0, .09), (.012, .012, .04), vertices=24, radius=1, depth=2)
    prim('cylinder', black, (0, 0, .34), (.021, .021, .03), vertices=32, radius=1, depth=2)
    prim('uv_sphere', black, (0, 0, .02), (.02, .02, .012), radius=1)
    prim('uv_sphere', mat_plain('led', (1, .2, .05) if on else (.2, .05, .03), emit=6 if on else 0), (0, -.02, .33), (.005,) * 3, radius=1)
    for z in (.08, .26):
        prim('cylinder', mat_plain('cup', (.5, .6, .65), rough=.2, alpha=.6), (0, .028, z), (.022, .022, .006),
             rot=(math.pi / 2, 0, 0), vertices=24, radius=1, depth=2)
    render('heater_on' if on else 'heater_off')


def filter_box():
    reset(.2, .52, .25)
    body = mat_plain('fbody', (.03, .035, .04), rough=.35)
    grill = mat_plain('grill', (.10, .11, .12), rough=.5)
    sponge = mat_noise('sponge', (.02, .05, .12), (.05, .12, .28), scale=60, rough=1, bump=1, bump_scale=160)
    prim('cube', body, (0, 0, .34), (.055, .04, .13), size=2)
    prim('cube', sponge, (0, 0, .12), (.05, .036, .1), size=2)
    for k in range(7):
        prim('cube', grill, (0, -.04, .25 + k * .022), (.04, .004, .005), size=2)
    prim('cylinder', body, (.07, 0, .44), (.014, .014, .03), rot=(0, math.pi / 2, 0), vertices=24, radius=1, depth=2)
    prim('cube', body, (0, 0, .015), (.058, .042, .012), size=2)
    render('filter')


def airstone():
    reset(.12, .1, .04)
    st = mat_noise('stone', (.25, .35, .5), (.4, .55, .7), scale=80, rough=1, bump=1, bump_scale=200)
    prim('cylinder', st, (0, 0, .03), (.014, .014, .035), rot=(0, math.pi / 2, 0), vertices=24, radius=1, depth=2)
    prim('cylinder', mat_plain('nip', (.05, .05, .05)), (.04, 0, .03), (.005, .005, .01), rot=(0, math.pi / 2, 0), vertices=12, radius=1, depth=2)
    render('airstone')


# ----------------------------------------------------------------- gravel
def gravel(name, palette, seed):
    reset(2.0, .24, .075, ppu=960)
    g = np.random.default_rng(seed)
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=2, radius=1)
    base = bpy.context.active_object
    bv = np.array([v.co[:] for v in base.data.vertices])
    bf = [tuple(p.vertices) for p in base.data.polygons]
    bpy.data.objects.remove(base)
    n = 8000
    x = g.uniform(-1.03, 1.03, n)
    y = g.uniform(0, .10, n)
    top = .15 + .018 * np.sin(x * 3.1 + 1) + .012 * np.sin(x * 7.3) + .006 * np.sin(x * 17)
    z = top - g.uniform(0, 1, n) * (top + .06) + y * .25
    r = g.uniform(.0055, .0105, n)
    sq = g.uniform(.55, 1, (n, 3))
    pal = np.array(palette)
    pc = pal[g.integers(0, len(pal), n)] * g.uniform(.75, 1.15, (n, 1))
    lump = 1 + .18 * g.normal(0, 1, (n, len(bv)))
    V = bv[None] * lump[:, :, None] * (r[:, None] * sq)[:, None, :] + np.stack([x, y, z], 1)[:, None, :]
    faces = [tuple(i * len(bv) + k for k in f) for i in range(n) for f in bf]
    col = np.concatenate([np.repeat(pc, len(bv), 0), np.ones((n * len(bv), 1))], 1)
    mesh_obj(name, V.reshape(-1, 3), faces, mat_attr(name, rough=.55, bump_scale=300, bump_strength=.2), col)
    bx = np.linspace(-1.03, 1.03, 200)
    bt = .15 + .018 * np.sin(bx * 3.1 + 1) + .012 * np.sin(bx * 7.3) + .006 * np.sin(bx * 17) - .006
    bverts = np.concatenate([np.stack([bx, np.full(200, .06), bt], 1), np.stack([bx, np.full(200, .06), np.full(200, -.1)], 1)])
    bcol = np.tile(np.array([*(pal.mean(0) * .45), 1.]), (400, 1))
    mesh_obj(name + '_back', bverts, [(i, i + 1, 200 + i + 1, 200 + i) for i in range(199)], mat_attr(name + 'b', rough=1), bcol)
    render(name)


JOBS = {
    'rock_slate': lambda: rock('rock_slate', 1, (.20, .21, .23), (.44, .45, .47)),
    'rock_river': lambda: rock('rock_river', 2, (.36, .28, .20), (.62, .54, .42), sx=1.25, sz=.5),
    'rock_lava': lambda: rock('rock_lava', 3, (.10, .07, .06), (.32, .20, .15), sx=.85, sz=.95, frame=(.5, .56)),
    'driftwood_a': lambda: driftwood('driftwood_a', 4),
    'driftwood_b': lambda: driftwood('driftwood_b', 9),
    'vallisneria': lambda: plant('vallisneria', (.9, 1.12), vallisneria),
    'sword': lambda: plant('sword', (.9, .7), sword),
    'anubias': lambda: plant('anubias', (.6, .36), anubias),
    'rotala': lambda: plant('rotala', (.7, .92), rotala),
    'hairgrass': lambda: plant('hairgrass', (1.0, .2), hairgrass),
    'castle': castle, 'pot': pot,
    'heater_on': lambda: heater(True), 'heater_off': lambda: heater(False),
    'filter': filter_box, 'airstone': airstone,
    'gravel_natural': lambda: gravel('gravel_natural', [(.55, .42, .28), (.40, .30, .20), (.68, .58, .42), (.30, .25, .2), (.75, .7, .6), (.48, .33, .2)], 1),
    'gravel_black': lambda: gravel('gravel_black', [(.04, .04, .045), (.08, .08, .09), (.02, .02, .02), (.14, .14, .15)], 2),
}
for jname, job in JOBS.items():
    if want(jname):
        try:
            job()
            print('DONE', jname)
        except Exception as e:  # keep going so one bad prop does not cost the batch
            import traceback
            traceback.print_exc()
            print('FAILED', jname, e)
