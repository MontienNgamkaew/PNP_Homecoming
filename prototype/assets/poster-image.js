async function preparePosterImage(file){
 const maxBytes=600*1024;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type))throw new Error('กรุณาเลือก JPG, PNG หรือ WebP');
 if(file.size>30*1024*1024)throw new Error('ภาพต้นฉบับต้องไม่เกิน 30 MB');
 const url=URL.createObjectURL(file),image=new Image();
 try{
  await new Promise((resolve,reject)=>{image.onload=resolve;image.onerror=()=>reject(new Error('ไม่สามารถอ่านภาพนี้ได้'));image.src=url;});
  const width=image.naturalWidth,height=image.naturalHeight;
  if(!width||!height||width*height>40000000)throw new Error('ภาพต้นฉบับต้องไม่เกิน 40 ล้านพิกเซล');
  const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d');if(!ctx)throw new Error('เบราว์เซอร์ไม่รองรับการบีบอัดภาพ');
  let scale=Math.min(1,2000/Math.max(width,height));
  try{
   for(let step=0;step<8;step++){
    canvas.width=Math.max(1,Math.round(width*scale));canvas.height=Math.max(1,Math.round(height*scale));ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.86,.82,.78,.74]){
     let blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/webp',quality));
     if(blob&&blob.type!=='image/webp')blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
     if(!blob)throw new Error('บีบอัดภาพไม่สำเร็จ');
     if(blob.size<=maxBytes){const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(new Error('อ่านภาพไม่สำเร็จ'));reader.readAsDataURL(blob);});return {file,data,bytes:blob.size,width:canvas.width,height:canvas.height};}
    }
    scale*=.85;
   }
   throw new Error('ภาพยังมีขนาดใหญ่เกินไป กรุณาเลือกภาพอื่น');
  }finally{canvas.width=0;canvas.height=0;}
 }finally{image.src='';URL.revokeObjectURL(url);}
}
