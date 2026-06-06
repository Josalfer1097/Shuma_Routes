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
    const serviceAccount = JSON.parse(
      process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '{}'
    );

    const auth = new GoogleAuth({
      credentials: serviceAccount,
      scopes: ['https://www.googleapis.com/auth/cloud-platform']
    });

    const body = await req.json();
    const client = await auth.getClient();
    const token = await client.getAccessToken();
    
    if (!token.token) {
      return Response.json({ error: 'No se pudo obtener el token de acceso' }, { status: 401 });
    }

    const projectId = process.env.GOOGLE_PROJECT_ID || 'shuma-rutas';
    const url = `https://routeoptimization.googleapis.com/v1/projects/${projectId}:optimizeTours`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    
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
