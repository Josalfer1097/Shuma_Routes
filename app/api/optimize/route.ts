import { GoogleAuth } from 'google-auth-library';

/* 
 * INSTRUCCIONES PARA CONFIGURAR LA SERVICE ACCOUNT:
 * 1. Google Cloud Console → IAM → Service Accounts
 * 2. Crear cuenta: shuma-rutas-optimizer
 * 3. Rol: Cloud Optimization AI Editor
 * 4. Crear key JSON y descargar
 * 5. Pegar el contenido completo del JSON en la variable de entorno GOOGLE_SERVICE_ACCOUNT_JSON
 * 6. Configurar GOOGLE_PROJECT_ID=shuma-rutas (o el ID real del proyecto) en .env.local
 */

export async function POST(req: Request) {
  try {
    const auth = new GoogleAuth({
      credentials: JSON.parse(
        process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}'
      ),
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const body = await req.json();
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    
    if (!token.token) {
      return Response.json({ error: 'No se pudo obtener el token de acceso' }, { status: 401 });
    }

    const projectId = process.env.GOOGLE_PROJECT_ID || 'shuma-rutas';
    console.log('=== PROJECT ID ===', projectId);
    console.log('=== URL COMPLETA ===', `https://cloudoptimization.googleapis.com/v1/projects/${projectId}:optimizeTours`);

    console.log('Payload enviado a Google:', JSON.stringify(body, null, 2));
    console.log('Token (primeros 20 chars):', token.token.substring(0, 20));

    const response = await fetch(
      `https://cloudoptimization.googleapis.com/v1/projects/${projectId}:optimizeTours`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      }
    );
    
    const data = await response.json();
    
    if (!response.ok) {
      console.error('Google error:', {
        status: response.status,
        body: data,
        scope: 'https://www.googleapis.com/auth/cloud-platform'
      });
      return Response.json(data, { status: response.status });
    }

    return Response.json(data);
  } catch (error: any) {
    console.error('Google error:', {
      status: error.status,
      body: error.body || error.message,
      scope: 'https://www.googleapis.com/auth/cloud-platform'
    });
    return Response.json(
      { error: 'Error interno en el servidor proxy' }, 
      { status: 500 }
    );
  }
}
