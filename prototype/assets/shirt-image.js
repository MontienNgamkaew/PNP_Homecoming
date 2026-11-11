// Keep uploads within the server limit; encode large originals on this device.
async function prepareShirtImage(file) {
  const limit = 1024 * 1024;
  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('กรุณาเลือกภาพ JPG, PNG หรือ WebP');
  if (file.size > 30 * limit) throw new Error('กรุณาเลือกภาพต้นฉบับไม่เกิน 30 MB');
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('ไฟล์ภาพไม่ถูกต้อง'));image.src=url;});
    const width=image.naturalWidth, height=image.naturalHeight;
    if(!width || !height || width*height>40000000) throw new Error('ภาพต้นฉบับต้องไม่เกิน 40 ล้านพิกเซล');
    const read = blob => new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('อ่านภาพไม่สำเร็จ'));reader.readAsDataURL(blob);});
    if(file.size<=limit) return {data:await read(file),bytes:file.size,compressed:false};
    const canvas=document.createElement('canvas'),context=canvas.getContext('2d');
    if(!context) throw new Error('เบราว์เซอร์นี้ไม่รองรับการบีบอัดภาพ');
    let scale=Math.min(1,2000/Math.max(width,height));
    try {
      for(let step=0;step<8;step++) {
        canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));
        context.fillStyle='#ffffff';context.fillRect(0,0,canvas.width,canvas.height);
        context.drawImage(image,0,0,canvas.width,canvas.height);
        for(const quality of [0.9,0.8,0.7,0.6,0.5]) {
          const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
          if(!blob) throw new Error('บีบอัดภาพไม่สำเร็จ กรุณาเลือกภาพใหม่');
          if(blob.size<=limit) return {data:await read(blob),bytes:blob.size,compressed:true};
        }
        scale*=0.8;
      }
      throw new Error('ไม่สามารถบีบอัดภาพให้เล็กกว่า 1 MB ได้ กรุณาเลือกภาพใหม่');
    } finally {canvas.width=0;canvas.height=0;}
  } finally {image.src='';URL.revokeObjectURL(url);}
}
