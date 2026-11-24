# Widget incrustable (`?embed`)

El presupuesto del cliente, pequeño, para ponerlo en una tienda (Shopify, WordPress…) dentro de un `<iframe>`. No es la calculadora: no sabe nada de tus costes ni de tu margen, solo de lo que **cobras**.

## Poner el widget en una página

```html
<iframe id="lc" title="Print estimate" scrolling="no" style="width:100%;border:0;height:520px"
  src="https://layercents.com/?embed&cur=CAD&pg=0.09&ph=3&pl=40&tax=13&taxname=HST&theme=dark&bg=transparent&text=F4F4F4&accent=C6FF00&radius=10"></iframe>

<script>
  // El iframe no puede medirse solo: nos manda su altura y la página la aplica.
  window.addEventListener('message', function (e) {
    if (e.origin !== 'https://layercents.com') return // nunca fiarse de otro origen
    if (e.data && e.data.type === 'layercents:height') document.getElementById('lc').style.height = e.data.height + 'px'
  })
</script>
```

El idioma sale de la ruta: `https://layercents.com/es/?embed…` o `/fr/?embed…`.

## Parámetros

Todo es opcional; lo que falta o no es válido vuelve al valor por defecto (un enlace mal escrito sigue mostrando un widget que funciona).

**Tarifas** (lo que paga el cliente, en tu moneda, **sin conversión**: un tipo de cambio movería el precio cada día y una tienda tiene que enseñar un precio estable).

| Parámetro | Qué es | Por defecto |
|---|---|---|
| `cur` | moneda, código ISO de 3 letras (`CAD`, `USD`, `EUR`) | `EUR` |
| `pg` | precio por gramo de filamento | `0.04` |
| `ph` | precio por hora de máquina | `2.5` |
| `pl` | precio por hora de mano de obra | `25` |
| `tax` | impuesto en % (13 para el HST de Ontario); con 0 no se enseña | `0` |
| `taxname` | nombre del impuesto («HST»), máximo 12 caracteres | — |

**Aspecto**

| Parámetro | Qué es | Por defecto |
|---|---|---|
| `theme` | `dark` o `light`: de ahí salen los colores que no pongas | `dark` |
| `bg` | color de fondo, **sin `#`** (`0A0A0A`), o `transparent` | del tema |
| `text` | color del texto, sin `#` | del tema |
| `accent` | color de acento (el total y el anillo de foco), sin `#` | `E3AE4F` |
| `radius` | redondeo de las esquinas, entero de 0 a 24 | `14` |
| `font` | `inter`, `system` o `serif` | `inter` |

- **Los colores van sin `#`**: en una dirección, `#` empieza el fragmento y el navegador no lo manda al servidor ni a la página (`?accent=#C6FF00` llega como `?accent=`). `accent=C6FF00` funciona, y `accent=%23C6FF00` también.
- Los grises (paneles, separadores, texto atenuado) se calculan a partir de `bg` y `text`; el texto atenuado se ajusta hasta llegar a 4,5:1 de contraste (WCAG AA). Si el acento no se lee como texto sobre el fondo (menos de 3:1), el total sale en el color del texto.
- `bg=transparent` deja ver el fondo de tu página. Si tu página declara `color-scheme: dark` (CSS), puede pintarse una caja opaca: es una regla del navegador cuando el esquema de la página y el del iframe no coinciden.
- Solo hay tres fuentes porque cada una es un paquete que se sirve desde el propio sitio. Si una tienda necesita otra (Space Grotesk, DM Sans…), se añade a `EMBED_FONTS` en `src/embed.js`.

## Seguridad: qué hay que saber

1. **Todo lo que pongas en la dirección es público.** Quien abra tu página lo lee en la etiqueta `<iframe>`. Ahí solo van las tarifas que cobras al cliente, nunca tus costes ni tu margen.
2. **El precio se calcula en el navegador del cliente**, así que puede manipularse (con las herramientas del navegador). Sirve para **enseñar** una estimación; si luego se cobra o se imprime automáticamente, el servidor tiene que volver a calcular el precio con sus propias tarifas.
3. **La dirección es entrada no confiable** (cualquiera puede mandar un enlace con lo que quiera). Por eso ningún texto de la dirección llega a CSS ni a HTML: los colores se validan como hexadecimales y se reescriben, la fuente es una clave de una lista nuestra y no un nombre, el redondeo es un entero acotado. Lo único libre es `taxname`, que React imprime como texto (escapado) y se corta a 12 caracteres. Tests en `src/embed.test.js`.
4. **El widget no guarda nada ni pide nada en la red**: ni `localStorage`, ni tipos de cambio, ni el agente de impresoras, ni el contador de Cloudflare Analytics (no cuenta las visitas de tu tienda como visitas de layercents).
5. **`postMessage` con `*`:** el widget manda su altura a cualquier página que lo incruste porque no sabe cuál es. Solo manda un número. Quien recibe tiene que comprobar `event.origin`, como en el ejemplo.

## Lo que no hace (todavía)

- Subir un archivo (STL, 3MF): hoy el cliente escribe gramos, horas y minutos de acabado. Leer el archivo y calcularlos exige laminar en un servidor.
- Enviar el presupuesto ni cobrarlo.
- Tarifas privadas guardadas en el servidor (haría falta una cuenta; un identificador en la dirección en vez de las tarifas).
