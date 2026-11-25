import pickle, numpy as np, fast_simplification as fs, matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from mpl_toolkits.mplot3d.art3d import Poly3DCollection
d=pickle.load(open('welded.pkl','rb'))
cols=plt.cm.tab20(np.linspace(0,1,len(d)))
fig=plt.figure(figsize=(16,8))
for k,(el,az) in enumerate([(15,30),(15,210)]):
    ax=fig.add_subplot(1,2,k+1,projection='3d')
    for i,(n,m) in enumerate(d.items()):
        v,f=m['v'],m['f']
        if len(f)>8000: v,f=fs.simplify(v,f,target_reduction=1-8000/len(f))
        # map Y-up to Z-up for mpl
        vv=v[:,[0,2,1]]
        pc=Poly3DCollection(vv[f],facecolor=cols[i],edgecolor='none',alpha=1)
        # simple shading
        n_=np.cross(vv[f][:,1]-vv[f][:,0],vv[f][:,2]-vv[f][:,0]);n_/=np.linalg.norm(n_,axis=1,keepdims=True)+1e-9
        sh=0.4+0.6*np.abs(n_@np.array([0.3,-0.5,0.8]))
        c=np.tile(cols[i],(len(f),1));c[:,:3]*=sh[:,None];pc.set_facecolor(c)
        ax.add_collection3d(pc)
        ax.text(*vv.mean(0),n,fontsize=8)
    ax.set_xlim(-250,350);ax.set_ylim(-250,350);ax.set_zlim(-100,400);ax.view_init(el,az);ax.set_box_aspect((1,1,0.83))
plt.tight_layout();plt.savefig('preview.png',dpi=80)
