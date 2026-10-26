# Documentación de Sustentación: Estacionamiento Inteligente Multinivel (SmartPark)

## 1. Estructuras de Datos Implementadas
1. **Matrices (`matrix[3][20]`)**:
   - Representa los 3 niveles con 20 espacios cada uno (60 cajones en total).
   - Mapea coordenadas espaciales, distancia física desde el ingreso, tipo de cajón (Normal, Discapacitado/PMR, Eléctrico/EV) y estado en tiempo real (`free`, `occupied`, `reserved`, `blocked`).

2. **Min-Heap / Binary Heap (`MinHeap`)**:
   - Organiza los espacios libres con menor costo de búsqueda en \(O(\log N)\).
   - El costo se calcula a través de una función de coste:
     \[
     \text{Costo} = \text{Distancia a rampa (m)} + \text{Factor congestión de nivel} + \text{Afinidad de vehículo}
     \]

3. **Cola FIFO (`WaitQueue`)**:
   - Gestiona vehículos en espera cuando el estacionamiento alcanza su capacidad máxima o no hay espacios compatibles.
   - Atiende en orden de llegada tan pronto un vehículo desocupa un espacio o expira una reserva.

4. **Pila LIFO (`MovementStack`)**:
   - Registra cada movimiento realizado en el estacionamiento (ingresos, salidas, bloqueos, reservas).
   - Permite la operación **"Deshacer" (Undo)** para revertir el último estado.

## 2. Componente Innovador: Asignación Adaptable & Predicción
- **Políticas Comparadas**:
  - **Primer Espacio Libre (First-Fit)**: Búsqueda lineal estándar de izquierda a derecha piso por piso.
  - **Menor Costo Estimado (Min-Heap)**: Asigna el espacio físicamente más cercano y óptimo para el usuario.
- **Predicción Sencilla de Saturación (Sin ML)**:
  - Analiza la tasa neta de flujo vehicular (\(\Delta\) vehículos/minuto) en las últimas 10 transacciones.
  - Estima el tiempo hasta la saturación crítica y proyecta el nivel de riesgo (Bajo, Medio, Crítico).

## 3. Prueba de Sustentación (80 Movimientos, 10 Reservas, 5 Bloqueos)
- Se ejecuta mediante el botón **"Prueba Sustentación (80-10-5)"** en la barra superior.
- Ejecuta una simulación idéntica para ambas políticas, computando la distancia promedio y el tiempo estimado de búsqueda para demostrar la eficiencia algorítmica.

## 4. Cómo Abrir y Ejecutar
Abre directamente el archivo `index.html` en cualquier navegador web moderno (Edge, Chrome, Firefox) o sírvelo localmente.
