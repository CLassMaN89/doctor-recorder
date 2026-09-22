importScripts('lame.min.js');
self.onmessage=function(event){
 try{
  const samples=new Int16Array(event.data.buffer),rate=Number(event.data.sampleRate)||44100,bitRate=Number(event.data.bitRate)||64;
  const encoder=new lamejs.Mp3Encoder(1,rate,bitRate),parts=[];
  for(let i=0;i<samples.length;i+=1152){const encoded=encoder.encodeBuffer(samples.subarray(i,i+1152));if(encoded.length)parts.push(new Uint8Array(encoded))}
  const tail=encoder.flush();if(tail.length)parts.push(new Uint8Array(tail));
  const size=parts.reduce((n,p)=>n+p.length,0),out=new Uint8Array(size);let offset=0;for(const part of parts){out.set(part,offset);offset+=part.length}
  self.postMessage({buffer:out.buffer},[out.buffer]);
 }catch(error){self.postMessage({error:String(error&&error.message||error)})}
};
