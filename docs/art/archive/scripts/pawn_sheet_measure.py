import bpy, numpy as np, os
DIR8 = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\frontend\public\assets\units\pawn\blender-render-helmet"
PROOF = r"D:\repos\chess-tactics\.claude\worktrees\fervent-bhaskara-15a39d\docs\art\unit-concepts\pawn-proof"
order=["south","south-east","east","north-east","north","north-west","west","south-west"]
cell=256; cols=4; rows=2; bg=np.array([0.12,0.14,0.17])
sheet=np.zeros((rows*cell,cols*cell,3)); sheet[:]=bg
for i,name in enumerate(order):
    img=bpy.data.images.load(os.path.join(DIR8,name+".png")); w,h=img.size
    px=np.array(img.pixels[:]).reshape(h,w,4)[::-1]
    px=px[::h//cell,::w//cell][:cell,:cell]
    comp=px[:,:,:3]*px[:,:,3:4]+bg*(1-px[:,:,3:4])
    r=i//cols; c=i%cols
    sheet[r*cell:(r+1)*cell,c*cell:(c+1)*cell]=comp
out=np.dstack([sheet,np.ones(sheet.shape[:2])])[::-1]
ni=bpy.data.images.new("pawn_sheet",cols*cell,rows*cell,alpha=True)
ni.pixels=out.reshape(-1).tolist(); ni.filepath_raw=os.path.join(PROOF,"_pawn_contact_sheet.png"); ni.file_format="PNG"; ni.save()

# footprint = max projected base width (max alpha row width in lower 45%)
img=bpy.data.images.load(os.path.join(DIR8,"south.png")); w,h=img.size
a=(np.array(img.pixels[:]).reshape(h,w,4)[::-1][:,:,3]>0.5)
ys=np.where(a.any(1))[0]; y0,y1=ys.min(),ys.max(); lo=int(y0+0.55*(y1-y0))
widths=np.array([ (np.where(a[y])[0].max()-np.where(a[y])[0].min()+1) if a[y].any() else 0 for y in range(h)])
br=lo+int(np.argmax(widths[lo:]))
print("footprint=%dpx (baseRow y=%d)  canvas=%dx%d" % (widths[br], br, w, h))
print("saved _pawn_contact_sheet.png")
