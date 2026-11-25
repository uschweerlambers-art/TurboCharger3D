import numpy as np, json, sys
from scipy import ndimage
meta=json.load(open('site/assets/flow_sdf.json')); dims=meta['dims']; lo=np.array(meta['min']); vox=meta['voxel']
d=np.fromfile('site/assets/flow_sdf.bin',dtype=np.uint8).reshape(dims[2],dims[1],dims[0]).transpose(2,1,0).astype(np.float32)*meta['scale']*vox
def sample(P): return ndimage.map_coordinates(d,((P-lo)/vox-0.5).T,order=1,mode='nearest')
z=float(sys.argv[1])
for y in np.arange(0.62,0.0,-0.02):
    row=''
    for x in np.arange(-0.62,0.05,0.01):
        dd=sample(np.array([[x,y,z]]))[0]; row+='#' if dd<0.011 else ('.' if dd<0.03 else ' ')
    print(f"{y:+.2f} |{row}|")
