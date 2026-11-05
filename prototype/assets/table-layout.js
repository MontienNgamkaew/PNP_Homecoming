// Stable numeric IDs retain existing bookings; only the displayed labels change.
const tableRows = ['A','B','C','D','E','F','G'].map((row,index)=>({row,count:index<2?8:9,start:index===0?1:index===1?9:17+(index-2)*9}));
const tableLayout = tableRows.flatMap(({row,count,start})=>Array.from({length:count},(_,i)=>({id:start+i,label:row+(i+1),row,column:i+1})));
const tableLabel = n => tableLayout.find(t=>t.id===Number(n))?.label || `เดิม ${n}`;
const tableNumber = value => tableLayout.find(t=>t.label===String(value).trim().toUpperCase())?.id ?? (/^\d+$/.test(String(value).trim())?Number(value):NaN);
const tableLabels = values => values.map(tableLabel).join(', ');
