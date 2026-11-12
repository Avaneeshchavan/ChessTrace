export function takeSharedImage(id) {
  const controller = navigator.serviceWorker?.controller;
  if (!controller || id === 'invalid') return Promise.resolve(null);
  return new Promise(resolve => {
    const channel = new MessageChannel();
    const finish = file => {
      clearTimeout(timer);
      channel.port1.close();
      resolve(file);
    };
    const timer = setTimeout(() => finish(null), 3_000);
    channel.port1.onmessage = event => finish(event.data);
    controller.postMessage({ type: 'TAKE_SHARED_IMAGE', id }, [channel.port2]);
  });
}
