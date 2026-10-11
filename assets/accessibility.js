/* Keep the skip link from being interpreted as an application route. MIT. */
document.querySelector('.skip').addEventListener('click', function (event) {
  event.preventDefault();
  document.getElementById('main').focus();
});
