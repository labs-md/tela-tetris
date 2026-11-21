/* Keep packing off the UI thread when served over HTTP. */
importScripts('arrange.js');
onmessage = ({ data: request }) => {
  try {
    const session = Arrange.session(request);
    const tick = () => {
      session.step(80);
      const result = session.result();
      postMessage({ result, done:session.done });
      if (!session.done) setTimeout(tick, 0);
    };
    tick();
  } catch (error) { postMessage({ error:error.message }); }
};
