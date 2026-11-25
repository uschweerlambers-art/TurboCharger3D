import struct, sys, json, numpy as np
def parse(path):
    data=open(path,'rb').read()
    objs=[]; mats={}; cur=None; curmat=None
    def rd_str(o):
        e=data.index(b'\0',o); return data[o:e].decode('latin1'), e+1
    def color(o,end):
        while o<end:
            cid,ln=struct.unpack_from('<HI',data,o)
            if cid==0x0011: return list(data[o+6:o+9])
            if cid==0x0010: return [int(x*255) for x in struct.unpack_from('<3f',data,o+6)]
            o+=ln
        return None
    def walk(o,end,depth=0):
        nonlocal cur,curmat
        while o<end:
            cid,ln=struct.unpack_from('<HI',data,o)
            if ln<6: break
            body=o+6; ce=o+ln
            if cid in (0x4D4D,0x3D3D,0x4100):
                walk(body,ce,depth+1)
            elif cid==0x4000:
                name,p=rd_str(body); cur={'name':name,'v':None,'f':None,'mats':[]}; walk(p,ce,depth+1)
                if cur['v'] is not None and cur['f'] is not None: objs.append(cur)
            elif cid==0x4110:
                n=struct.unpack_from('<H',data,body)[0]
                cur['v']=np.frombuffer(data,dtype='<f4',count=n*3,offset=body+2).reshape(-1,3).copy()
            elif cid==0x4120:
                n=struct.unpack_from('<H',data,body)[0]
                cur['f']=np.frombuffer(data,dtype='<u2',count=n*4,offset=body+2).reshape(-1,4)[:,:3].astype(np.int64)
                p=body+2+n*8
                while p<ce:
                    sid,sl=struct.unpack_from('<HI',data,p)
                    if sid==0x4130:
                        mn,q=rd_str(p+6); k=struct.unpack_from('<H',data,q)[0]
                        idx=np.frombuffer(data,dtype='<u2',count=k,offset=q+2).copy()
                        cur['mats'].append((mn,idx))
                    p+=sl
            elif cid==0xAFFF:
                curmat={}; walk(body,ce,depth+1)
                mats[curmat.get('name','?')]=curmat
            elif cid==0xA000: curmat['name']=rd_str(body)[0]
            elif cid==0xA020: curmat['diffuse']=color(body,ce)
            elif cid==0xA030: curmat['spec']=color(body,ce)
            o=ce
    walk(0,len(data))
    return objs,mats
if __name__=='__main__':
    objs,mats=parse(sys.argv[1])
    tot=0
    for ob in objs:
        v=ob['v']; tot+=len(ob['f'])
        print(f"{ob['name'][:30]:30s} v={len(v):6d} f={len(ob['f']):6d} bb={v.min(0).round(1)}..{v.max(0).round(1)} mats={[m[0] for m in ob['mats']]}")
    print('objects',len(objs),'faces',tot)
    print(json.dumps(mats,indent=0)[:3000])
