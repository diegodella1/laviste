const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.site-nav');
menu?.addEventListener('click', () => {
  const open = menu.getAttribute('aria-expanded') !== 'true';
  menu.setAttribute('aria-expanded', String(open));
  menu.textContent = open ? 'Cerrar −' : 'Menú +';
  navigation.classList.toggle('open', open);
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && menu?.getAttribute('aria-expanded') === 'true') {
    menu.click();
    menu.focus();
  }
});
const examples = {
  hypothesis: ['Hipótesis', 'Una idea que se puede discutir.', 'La IA en dispositivos propios podría aumentar la demanda de chips. Falta comprobar adopción, costos y competencia.'],
  evidence: ['Evidencia a buscar', 'Una pregunta concreta.', '¿Los fabricantes informan ventas sostenidas de equipos con IA local? En tu espacio, cada revisión busca fuentes y separa hechos de interpretaciones.'],
  change: ['Criterio de revisión', 'Cambiar de opinión también cuenta.', 'Si la adopción no crece o los márgenes se deterioran, toca revisar la idea. Una caída del precio, por sí sola, no responde esa pregunta.'],
};
document.querySelectorAll('[data-example]').forEach(button => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-example]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    const [label, title, copy] = examples[button.dataset.example];
    document.querySelector('#example-label').textContent = label;
    document.querySelector('#example-title').textContent = title;
    document.querySelector('#example-copy').textContent = copy;
  });
});
// Preserve bookmarked hash routes from the original app home.
if (location.pathname === '/' && location.hash.startsWith('#/')) location.replace('/app' + location.hash);
