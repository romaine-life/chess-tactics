import bpy, numpy as np, sys
f=sys.argv[-1]; img=bpy.data.images.load(f); w,h=img.size
a=np.array(img.pixels[:]).reshape(h,w,4)[::-1][:,:,3]>0.4
rows=np.where(a.any(1))[0]; cols=np.where(a.any(0))[0]
print("size %dx%d" % (w,h))
print("alpha rows %d..%d  cols %d..%d" % (rows.min(),rows.max(),cols.min(),cols.max()))
# width per row to find the 'equator' (widest = top-face/side boundary)
widths=np.array([(np.where(a[y])[0].max()-np.where(a[y])[0].min()+1) if a[y].any() else 0 for y in range(h)])
eq=int(np.argmax(widths))
print("widest row y=%d width=%d (diamond equator / front corner)" % (eq, widths[eq]))
print("top apex y=%d  bottom y=%d  side-height(px)=%d" % (rows.min(), rows.max(), rows.max()-eq))
