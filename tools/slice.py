import numpy as np, json, sys
from scipy import ndimage
meta=json.load(open('site/assets/flow_sdf.json')); dims=meta['dims']; lo=np.array(meta['min']); vox=meta['voxel']
d=np.fromfile('site/assets/flow_sdf.bin',dtype=np.uint8).reshape(dims[2],dims[1],dims[0]).transpose(2,1,0).astype(np.float32)*meta['scale']*vox
def sample(P): return ndimage.map_coordinates(d,((P-lo)/vox-0.5).T,order=1,mode='nearest')
deg=float(sys.argv[1]); y0,y1=float(sys.argv[2]),float(sys.argv[3]); rmax=float(sys.argv[4])
t=np.radians(deg); step=0.015
for y in np.arange(y1,y0,-step):
    row=''
    for r in np.arange(0,rmax,step*0.5):
        dd=sample(np.array([[r*np.cos(t),y,r*np.sin(t)]]))[0]
        row+= '#' if dd<0.011 else ('.' if dd<0.04 else ' ')
    print(f"{y:+.2f} |{row}|")
print('      r: 0 ... ',rmax)
