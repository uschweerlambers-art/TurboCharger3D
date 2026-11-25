import numpy as np, json
from scipy import ndimage
meta=json.load(open('site/assets/flow_sdf.json')); dims=meta['dims']; lo=np.array(meta['min']); vox=meta['voxel']
d=np.fromfile('site/assets/flow_sdf.bin',dtype=np.uint8).reshape(dims[2],dims[1],dims[0]).transpose(2,1,0).astype(np.float32)*meta['scale']*vox
def sample(P): return ndimage.map_coordinates(d,((P-lo)/vox-0.5).T,order=1,mode='nearest')
def scan(yr, rmax, rcut, ycut, below, step=0.005):
    rs=np.arange(0,rmax,step); ys=np.arange(yr[0],yr[1],step)
    R,Y=np.meshgrid(rs,ys,indexing='ij')
    out=[]
    for deg in range(0,360,2):
        t=np.radians(deg)
        dist=sample(np.stack([R*np.cos(t),Y,R*np.sin(t)],-1).reshape(-1,3)).reshape(R.shape)
        win=(R>rcut)&((Y<ycut) if below else (Y>ycut))
        free=(dist>0.011)&win
        lab,n=ndimage.label(free)
        border=set(np.unique(np.concatenate([lab[0],lab[-1],lab[:,0],lab[:,-1]])))
        best=None
        for k in range(1,n+1):
            if k in border: continue
            m=lab==k; a=m.sum()*step*step
            if a<0.001: continue
            i=np.argmax(np.where(m,dist,-1))
            if best is None or a>best[3]: best=(R.flat[i],Y.flat[i],dist.flat[i],a)
        out.append([deg]+([round(float(x),4) for x in best] if best else [None]*4))
    return out
comp=scan((0.05,0.64),0.95,0.22,0.25,False)
turb=scan((-0.62,-0.02),1.15,0.37,-0.24,True)
json.dump({'comp':comp,'turb':turb},open('centerlines.json','w'))
for nm,arr in (('comp',comp),('turb',turb)):
    print(nm); print(' '.join(f"{a[0]}:{a[1]},{a[2]},{a[3]}" if a[1] is not None else f"{a[0]}:-" for a in arr[::3]))
