importScripts('arrange.js', 'woodworking.js');
onmessage = ({data}) => {
  try {
    if (data.kind === 'wood') { postMessage({result:Woodworking.plan(data.order,data.stock),done:true}); return; }
    const session=Arrange.session(data.request || data);
    const tick=()=>{
      session.step(80);postMessage({result:session.result(),done:session.done});
      if(!session.done)setTimeout(tick,0);
    };
    tick();
  } catch(error) { postMessage({error:error.message}); }
};
