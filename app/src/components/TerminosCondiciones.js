import React, { useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, Modal } from 'react-native';

const TERMINOS_CLIENTE = `TÉRMINOS Y CONDICIONES PARA USUARIOS

PREÁMBULO
Los presentes Términos y Condiciones regulan el acceso y uso de la aplicación móvil UNTAXTAME, propiedad de UNTAXTAME S.A.S., sociedad por acciones simplificada constituida mediante documento privado del 11 de marzo de 2023, domiciliada en el municipio de Tame, Departamento de Arauca, República de Colombia.

El uso de la Aplicación implica la aceptación total e irrevocable de estas disposiciones por parte del usuario. Si el Usuario no está de acuerdo con alguno de estos términos, deberá abstenerse de utilizar la Plataforma.

1. DEFINICIONES
1.1. UNTAXTAME S.A.S.: Empresa de transporte tecnológico que opera como intermediaria entre conductores de taxi y usuarios.
1.2. Usuario: Persona natural mayor de edad (18 años o más) que solicita un servicio de taxi a través de la Aplicación.
1.3. Conductor: Taxista debidamente autorizado, vinculado a UNTAXTAME S.A.S. mediante contrato de afiliación.
1.4. Servicio: Transporte terrestre de pasajeros en vehículo taxi.
1.5. Tarifa: Valor económico del servicio.

2. ACEPTACIÓN DE LOS TÉRMINOS
2.1. Al descargar, instalar, registrar o utilizar la Aplicación UNTAXTAME, el Usuario declara bajo juramento que ha leído, comprendido y aceptado la totalidad de estos Términos y Condiciones.

3. REQUISITOS PARA USAR LA APLICACIÓN
3.1. Ser mayor de edad (18 años o más).
3.2. Contar con un dispositivo móvil con conexión a internet.
3.3. Registrarse proporcionando información veraz, completa y actualizada.
3.4. Aceptar la Política de Tratamiento de Datos Personales.

4. OBLIGACIONES DEL USUARIO
6.1. Proporcionar información veraz.
6.2. Estar puntual en el punto de recogida (máximo 5 minutos de espera).
6.3. Usar el cinturón de seguridad durante todo el trayecto.
6.4. Tratar con respeto al conductor.
6.5. Pagar la tarifa acordada.
6.6. Cuidar el vehículo.

5. PROHIBICIONES
7.1. Solicitar viajes para actos ilícitos.
7.2. Agredir física o verbalmente al conductor.
7.3. Discriminar al conductor.
7.4. Viajar en estado de embriaguez que ponga en riesgo la seguridad.
7.5. Superar la capacidad del vehículo.

6. TARIFAS Y FORMAS DE PAGO
Tarifa mínima: $8,000 COP. El precio se negocia entre conductor y cliente por medio de ofertas.
Formas de pago: Efectivo, Daviplata, Nequi, PSE.

7. DATOS PERSONALES (Ley 1581 de 2012)
La Aplicación recopila: ubicación GPS, historial de viajes, calificaciones.
Derechos: Conocer, actualizar, corregir o eliminar sus datos escribiendo a Untaxtameapp@gmail.com.

8. SEGURIDAD
La Aplicación cuenta con botón de pánico y sistema de emergencias SOS.

9. LIMITACIÓN DE RESPONSABILIDAD
UNTAXTAME S.A.S. actúa como intermediario tecnológico. No es responsable por accidentes, objetos olvidados o actos delictivos.

10. JURISDICCIÓN
Estos términos se rigen por las leyes de la República de Colombia.

Correo de contacto: Untaxtameapp@gmail.com
Dirección: Calle 6 No 8-39, Tame, Arauca`;

const TERMINOS_CONDUCTOR = `TÉRMINOS DE USO Y GUÍAS PARA CONDUCTORES DE TAXI
APLICACIÓN UNTAXTAME

Correo de contacto: Untaxtameapp@gmail.com

PREÁMBULO
Estos Términos de Uso regulan la relación entre UNTAXTAME S.A.S. y el conductor de taxi registrado. El uso de la aplicación implica la aceptación total e irrevocable de estas disposiciones, conforme a las leyes de la República de Colombia.

1. NATURALEZA DE LA RELACIÓN
1.1. Contratista independiente. No existe relación laboral con la Empresa.
1.2. Ausencia de subordinación. El Conductor es libre de conectar o desconectarse.
1.3. Responsabilidad fiscal y laboral. El Conductor asume obligaciones tributarias y de seguridad social.
1.4. Tarjeta de operación vigente obligatoria.

2. DOCUMENTACIÓN REQUERIDA
2.1. Licencia de conducción vigente.
2.2. Tarjeta de operación del taxi.
2.3. SOAT vigente.
2.4. Revisión técnico-mecánica vigente.
2.5. Certificado de tradición y libertad del vehículo.

3. DISCRIMINACIÓN, ACOSO Y AGRESIÓN
Prohibido estrictamente. Sanción: Suspensión inmediata + cancelación definitiva + reporte a autoridades.

4. DATOS PERSONALES (Ley 1581 de 2012)
Datos recopilados: Ubicación GPS, historial de viajes, calificaciones, documentos.
Derechos: Acceder, corregir, actualizar o eliminar datos escribiendo a Untaxtameapp@gmail.com.

5. SEGURIDAD VIAL
5.1. Cumplir el Código Nacional de Tránsito.
5.2. Prohibido usar celular mientras conduce (excepto manos libres).
5.3. No conducir bajo fatiga. Máximo 8 horas diarias recomendadas.

6. CONSUMO DE ALCOHOL Y DROGAS
Cero tolerancia. Suspensión definitiva inmediata.

7. PROCEDIMIENTOS DEL SERVICIO
7.1. Verificar estado mecánico antes de iniciar jornada.
7.2. Confirmar recogida del usuario.
7.3. Finalizar servicio cuando el pasajero haya descendido y pagado.

8. PAGOS Y TARIFAS
Tarifa mínima: $8,000 COP. El precio se negocia por ofertas.
Formas de pago: Efectivo, Daviplata, Nequi, PSE.

9. CAUSALES DE SUSPENSIÓN Y EXPULSIÓN
Suspensión: Conducción peligrosa, calificación baja, fraude GPS.
Expulsión: Agresión sexual, conducir ebrio, extorsión, hurto.

10. JURISDICCIÓN
Estos términos se rigen por las leyes de la República de Colombia.

Correo de contacto: Untaxtameapp@gmail.com
Dirección: Calle 6 No 8-39, Tame, Arauca`;

export default function TerminosCondiciones({ tipo, aceptado, onAceptar }) {
  const [modalVisible, setModalVisible] = useState(false);
  const texto = tipo === 'conductor' ? TERMINOS_CONDUCTOR : TERMINOS_CLIENTE;
  const titulo = tipo === 'conductor' ? 'Términos para Conductores' : 'Términos para Usuarios';

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.checkRow} onPress={() => onAceptar(!aceptado)}>
        <View style={[styles.checkbox, aceptado && styles.checkboxActivo]}>
          {aceptado && <Text style={styles.checkmark}>✓</Text>}
        </View>
        <Text style={styles.checkTexto}>
          He leído y acepto los{' '}
          <Text style={styles.link} onPress={() => setModalVisible(true)}>
            Términos y Condiciones
          </Text>
        </Text>
      </TouchableOpacity>

      <Modal visible={modalVisible} animationType="slide">
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitulo}>📋 {titulo}</Text>
            <TouchableOpacity onPress={() => setModalVisible(false)}>
              <Text style={styles.modalCerrar}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTexto}>{texto}</Text>
          </ScrollView>
          <View style={styles.modalFooter}>
            <TouchableOpacity style={styles.btnAceptar} onPress={() => { onAceptar(true); setModalVisible(false); }}>
              <Text style={styles.btnAceptarTexto}>✅ ACEPTO los Términos y Condiciones</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.btnCerrarModal} onPress={() => setModalVisible(false)}>
              <Text style={styles.btnCerrarTexto}>Cerrar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 16 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  checkbox: {
    width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#ddd',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxActivo: { backgroundColor: '#2E7D32', borderColor: '#2E7D32' },
  checkmark: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  checkTexto: { flex: 1, fontSize: 13, color: '#555' },
  link: { color: '#1565C0', fontWeight: 'bold', textDecorationLine: 'underline' },

  modalContainer: { flex: 1, backgroundColor: '#fff' },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: 16, paddingTop: 50, backgroundColor: '#FFC107',
  },
  modalTitulo: { fontSize: 18, fontWeight: 'bold' },
  modalCerrar: { fontSize: 24, fontWeight: 'bold' },
  modalScroll: { flex: 1 },
  modalContent: { padding: 20 },
  modalTexto: { fontSize: 14, lineHeight: 22, color: '#333' },
  modalFooter: { padding: 16, borderTopWidth: 1, borderTopColor: '#eee' },
  btnAceptar: { backgroundColor: '#2E7D32', borderRadius: 10, padding: 16, alignItems: 'center', marginBottom: 8 },
  btnAceptarTexto: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  btnCerrarModal: { padding: 12, alignItems: 'center' },
  btnCerrarTexto: { color: '#999', fontWeight: 'bold' },
});
