(function () {
  const canvas = document.getElementById('nav-logo');
  if (!canvas) return;
  const img = new Image();
  img.onload = function () {
    canvas.width = 128;
    canvas.height = 128;
    canvas.getContext('2d').drawImage(img, 0, 0, 128, 128);
  };
  img.src = '/poppie.gif';
})();
