import numpy as np, struct, json
from scipy import ndimage
from pygltflib import GLTF2
g=GLTF2().load('site/assets/turbo_hi_raw.glb'); blob=g.binary_blob()
def acc(i,dt,nc):
    a=g.accessors[i]; bv=g.bufferViews[a.bufferView]
    return np.frombuffer(blob,dtype=dt,count=a.count*nc,offset=bv.byteOffset).reshape(-1,nc) if nc>1 else np.frombuffer(blob,dtype=dt,count=a.count,offset=bv.byteOffset)
vox=0.01
lo=np.array([-0.62,-0.56,-0.60]); hi=np.array([0.88,0.60,0.68])
dims=np.ceil((hi-lo)/vox).astype(int); print('dims',dims,dims.prod())
solid=np.zeros(dims,bool)
for m in g.meshes:
    if m.name not in ('Tube','Tube_1','midle_1','tie'): continue
    p=m.primitives[0]; P=acc(p.attributes.POSITION,'<f4',3); I=acc(p.indices,'<u4',1).reshape(-1,3)
    T=P[I]; e1=T[:,1]-T[:,0]; e2=T[:,2]-T[:,0]
    L=np.maximum(np.linalg.norm(e1,axis=1),np.linalg.norm(e2,axis=1))
    n=np.clip(np.ceil(L/(vox*0.5)).astype(int),1,40)
    for k in np.unique(n):
        sel=np.where(n==k)[0]; 
        uu,vv=np.meshgrid(np.arange(k+1),np.arange(k+1)); m_=(uu+vv)<=k; uu=uu[m_]/k; vv=vv[m_]/k
        pts=(T[sel,0][:,None,:]+e1[sel][:,None,:]*uu[None,:,None]+e2[sel][:,None,:]*vv[None,:,None]).reshape(-1,3)
        ix=np.floor((pts-lo)/vox).astype(int); ok=np.all((ix>=0)&(ix<dims),1); ix=ix[ok]
        solid[ix[:,0],ix[:,1],ix[:,2]]=True
    print(m.name,'done',solid.sum())
dist=ndimage.distance_transform_edt(~solid)  # voxels
d8=np.clip(dist*10,0,255).astype(np.uint8)
# layout for Data3DTexture: x fastest, then y, then z  -> array [z][y][x]
d8.transpose(2,1,0).tofile('site/assets/flow_sdf.bin')
json.dump({'dims':dims.tolist(),'min':lo.tolist(),'max':(lo+dims*vox).tolist(),'voxel':vox,'scale':0.1},open('site/assets/flow_sdf.json','w'))
print('size',d8.size/1e6,'MB')
