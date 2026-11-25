import sys, numpy as np, fast_simplification as fs, pickle
sys.path.insert(0,'tools'); from parse3ds import parse
objs,mats=parse(sys.argv[1])
groups={}; order=[]; cur=None
for ob in objs:
    if not ob['name'].startswith('TooBig'): cur=ob['name']; order.append(cur); groups[cur]=[]
    groups[cur].append(ob)
out={}
for g in order:
    V=[];F=[];off=0
    for ob in groups[g]:
        V.append(ob['v']);F.append(ob['f']+off);off+=len(ob['v'])
    V=np.concatenate(V).astype(np.float64);F=np.concatenate(F)
    # weld
    q=np.round(V*200).astype(np.int64)
    _,uidx,inv=np.unique(q,axis=0,return_index=True,return_inverse=True)
    V=V[uidx];F=inv.reshape(-1)[F]
    F=F[(F[:,0]!=F[:,1])&(F[:,1]!=F[:,2])&(F[:,0]!=F[:,2])]
    out[g]={'v':V.astype(np.float32),'f':F.astype(np.int32),'mat':groups[g][0]['mats'][0][0] if groups[g][0]['mats'] else ''}
    print(g,len(V),len(F),out[g]['mat'])
pickle.dump(out,open('welded.pkl','wb'))
