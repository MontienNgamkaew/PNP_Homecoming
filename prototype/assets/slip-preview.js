let slipPreviewState=null;
function clearSlipPreview(){
  if(!slipPreviewState)return;
  const old=slipPreviewState;slipPreviewState=null;old.controller.abort();
  if(old.url)URL.revokeObjectURL(old.url);
  old.renderTask?.cancel();if(old.pdfTask)Promise.resolve(old.pdfTask.destroy()).catch(()=>{});
  const canvas=document.querySelector('#slip-preview canvas');if(canvas){canvas.width=0;canvas.height=0;}
  if(old.trigger?.isConnected)old.trigger.focus();
}
async function openSlipPreview(ref,trigger){
  modal(`<section id="slip-preview"><h2>สลิป / เอกสาร ${esc(ref)}</h2><p id="slip-preview-status" role="status">กำลังโหลดเอกสาร…</p><div id="slip-preview-document"></div></section>`);
  const state={controller:new AbortController(),url:null,trigger};slipPreviewState=state;
  const timeout=setTimeout(()=>state.controller.abort(),20000);
  try{
    const response=await fetch('/api/admin/order-slip/'+encodeURIComponent(ref),{cache:'no-store',signal:state.controller.signal});
    if(!response.ok){let message='ไม่สามารถเปิดเอกสารได้';try{message=(await response.json()).error||message;}catch(_){}throw new Error(message);}
    const mime=response.headers.get('Content-Type')?.split(';')[0].trim();
    if(!['image/png','image/jpeg','image/webp','application/pdf'].includes(mime))throw new Error('รูปแบบเอกสารนี้ไม่รองรับการพรีวิว');
    const blob=await response.blob();
    if(slipPreviewState!==state)return;
    state.url=URL.createObjectURL(new Blob([blob],{type:mime}));
    const container=document.querySelector('#slip-preview-document');
    if(mime==='application/pdf'){
      document.querySelector('#slip-preview-status').textContent='กำลังแสดง PDF…';
      const pdfjs=await import('./pdfjs/pdf.min.js');
      if(slipPreviewState!==state)return;
      pdfjs.GlobalWorkerOptions.workerSrc=new URL('./pdfjs/pdf.worker.min.js',new URL('assets/slip-preview.js',document.baseURI)).href;
      const base=new URL('assets/pdfjs/',document.baseURI).href;
      state.pdfTask=pdfjs.getDocument({data:new Uint8Array(await blob.arrayBuffer()),cMapUrl:base+'cmaps/',cMapPacked:true,standardFontDataUrl:base+'standard_fonts/',wasmUrl:base+'wasm/',isEvalSupported:false,disableFontFace:true});
      const pdf=await state.pdfTask.promise;if(slipPreviewState!==state)return;
      const toolbar=document.createElement('div');toolbar.className='slip-pdf-toolbar';
      const control=(label,text)=>{const button=document.createElement('button');button.type='button';button.className='ui-btn ui-btn-sm ui-btn-outline';button.setAttribute('aria-label',label);button.textContent=text;toolbar.append(button);return button;};
      const previous=control('PDF หน้าก่อนหน้า','←'),next=control('PDF หน้าถัดไป','→');
      const pageLabel=document.createElement('span');pageLabel.setAttribute('role','status');toolbar.append(pageLabel);
      const zoomOut=control('ย่อ PDF','−'),zoomIn=control('ขยาย PDF','＋');container.append(toolbar);
      const scroll=document.createElement('div');scroll.className='slip-pdf-pages';const canvas=document.createElement('canvas');canvas.setAttribute('role','img');canvas.setAttribute('aria-label','เนื้อหาเอกสาร PDF '+ref);scroll.append(canvas);container.append(scroll);
      let pageNumber=1,zoom=1,rendering=false;
      async function render(){
        if(rendering||slipPreviewState!==state)return;rendering=true;
        for(const b of [previous,next,zoomOut,zoomIn])b.disabled=true;
        try{
          const page=await pdf.getPage(pageNumber);if(slipPreviewState!==state)return;
          const original=page.getViewport({scale:1}),available=Math.max(240,container.clientWidth-20),scale=Math.min(2,available/original.width)*zoom;
          const viewport=page.getViewport({scale}),density=Math.min(window.devicePixelRatio||1,2,Math.sqrt(12000000/(viewport.width*viewport.height)));
          canvas.width=Math.ceil(viewport.width*density);canvas.height=Math.ceil(viewport.height*density);canvas.style.width=viewport.width+'px';canvas.style.height=viewport.height+'px';
          state.renderTask=page.render({canvasContext:canvas.getContext('2d'),viewport,transform:[density,0,0,density,0,0]});await state.renderTask.promise;
          if(slipPreviewState===state){pageLabel.textContent=`หน้า ${pageNumber} / ${pdf.numPages}`;document.querySelector('#slip-preview-status').textContent='เอกสาร PDF · เปลี่ยนหน้าและขยายดูรายละเอียดได้';}
        }finally{rendering=false;if(slipPreviewState===state){previous.disabled=pageNumber<=1;next.disabled=pageNumber>=pdf.numPages;zoomOut.disabled=zoom<=0.5;zoomIn.disabled=zoom>=2;}}
      }
      const redraw=()=>render().catch(()=>{if(slipPreviewState===state)document.querySelector('#slip-preview-status').textContent='ไม่สามารถแสดง PDF หน้านี้ได้';});
      previous.onclick=()=>{pageNumber--;redraw();};next.onclick=()=>{pageNumber++;redraw();};zoomOut.onclick=()=>{zoom=Math.max(0.5,zoom-0.25);redraw();};zoomIn.onclick=()=>{zoom=Math.min(2,zoom+0.25);redraw();};
      await render();
    }else{
      const img=document.createElement('img');img.alt='สลิป / เอกสาร '+ref;img.src=state.url;container.append(img);
      img.onerror=()=>{if(slipPreviewState===state)document.querySelector('#slip-preview-status').textContent='ไม่สามารถแสดงภาพนี้ได้';};
      document.querySelector('#slip-preview-status').textContent='เลื่อนดูเอกสารได้ · กด × หรือ Esc เพื่อปิด';
    }
  }catch(error){if(slipPreviewState===state)document.querySelector('#slip-preview-status').textContent=error.name==='AbortError'?'โหลดเอกสารนานเกินไป กรุณาปิดแล้วลองใหม่':error.message;}
  finally{clearTimeout(timeout);}
}
