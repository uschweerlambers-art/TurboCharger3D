import pickle, numpy as np, fast_simplification as fs, json, struct, sys
d=pickle.load(open('welded.pkl','rb'))
import json as _j
bud=_j.loads(sys.argv[1]); outp=sys.argv[2]
mins={'blades':3240,'screw':3729,'screw_1':3729}
tot=sum(len(m['f']) for m in d.values())
def creased(v,f,ang=35):
    tri=v[f]; fn=np.cross(tri[:,1]-tri[:,0],tri[:,2]-tri[:,0]); area=np.linalg.norm(fn,axis=1,keepdims=True)+1e-12; fnu=fn/area
    nv=len(v); nf=len(f)
    cv=f.reshape(-1); cf=np.repeat(np.arange(nf),3)
    order=np.argsort(cv,kind='stable'); cv_s=cv[order]; cf_s=cf[order]
    start=np.searchsorted(cv_s,np.arange(nv)); cnt=np.bincount(cv,minlength=nv)
    cosT=np.cos(np.radians(ang))
    out=np.zeros((nf*3,3))
    maxd=min(cnt.max(),48)
    myf=cf  # corner -> face
    myv=cv
    for k in range(maxd):
        has=cnt[myv]>k
        idx=np.where(has)[0]
        nbf=cf_s[start[myv[idx]]+k]
        dot=(fnu[myf[idx]]*fnu[nbf]).sum(1)
        ok=dot>cosT
        out[idx[ok]]+=fn[nbf[ok]]
    out/=np.linalg.norm(out,axis=1,keepdims=True)+1e-12
    pos=v[cv]
    key=np.concatenate([np.round(pos*100),np.round(out*64)],1).astype(np.int64)
    _,ui,inv=np.unique(key,axis=0,return_index=True,return_inverse=True)
    return pos[ui].astype(np.float32),out[ui].astype(np.float32),inv.reshape(-1,3).astype(np.uint32)
bin_=bytearray(); bvs=[]; accs=[]; meshes=[]; nodes=[]; meta={}
def add(arr,target,comp,typ,mm=False):
    b=arr.tobytes(); off=len(bin_); bin_.extend(b); 
    while len(bin_)%4: bin_.append(0)
    bvs.append({'buffer':0,'byteOffset':off,'byteLength':len(b),'target':target})
    a={'bufferView':len(bvs)-1,'componentType':comp,'count':len(arr),'type':typ}
    if mm: a['min']=arr.min(0).tolist(); a['max']=arr.max(0).tolist()
    accs.append(a); return len(accs)-1
# center: shaft axis x=z=0; y center
allv=np.concatenate([m['v'] for m in d.values()]); c=(allv.min(0)+allv.max(0))/2; c[0]=0;c[2]=0
S=1/400.
total_out=0
for n,m in d.items():
    tgt=bud.get(n,len(m['f']))
    v,f=m['v'],m['f']
    if tgt<len(f): v,f=fs.simplify(v,f,target_reduction=1-tgt/len(f),agg=5)
    v=(v-c)*S
    p,nn,ix=creased(v.astype(np.float64),f)
    total_out+=len(ix)
    ia=add(ix.reshape(-1),34963,5125,'SCALAR'); pa=add(p,34962,5126,'VEC3',True); na=add(nn,34962,5126,'VEC3')
    meshes.append({'name':n,'primitives':[{'attributes':{'POSITION':pa,'NORMAL':na},'indices':ia}]})
    nodes.append({'name':n,'mesh':len(meshes)-1})
    meta[n]={'tris':int(len(ix)),'min':p.min(0).tolist(),'max':p.max(0).tolist(),'center':((p.min(0)+p.max(0))/2).tolist()}
    print(n,len(ix))
gl={'asset':{'version':'2.0','generator':'equiloud'},'scene':0,'scenes':[{'nodes':list(range(len(nodes)))}],'nodes':nodes,'meshes':meshes,'accessors':accs,'bufferViews':bvs,'buffers':[{'byteLength':len(bin_)}]}
js=json.dumps(gl).encode(); 
while len(js)%4: js+=b' '
glb=struct.pack('<III',0x46546C67,2,12+8+len(js)+8+len(bin_))+struct.pack('<II',len(js),0x4E4F534A)+js+struct.pack('<II',len(bin_),0x004E4942)+bin_
open(outp,'wb').write(glb); json.dump(meta,open(outp+'.json','w'),indent=1)
print('total',total_out,len(glb)/1e6,'MB')
