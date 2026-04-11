import { tool } from 'ai'
import { z } from 'zod'

export default tool({
  description: 'Get current weather for a city',
  parameters: z.object({
    city: z.string().describe('City name, e.g. "London" or "New York"')
  }),
  execute: async ({ city }) => {
    const geoUrl = new URL('https://geocoding-api.open-meteo.com/v1/search')
    geoUrl.searchParams.set('name', city)
    geoUrl.searchParams.set('count', '1')

    const geoRes = await fetch(geoUrl)
    const geoData = await geoRes.json()

    if (!geoData.results?.length) {
      return { error: `City not found: ${city}` }
    }

    const { latitude, longitude, name, country } = geoData.results[0]

    const weatherUrl = new URL('https://api.open-meteo.com/v1/forecast')
    weatherUrl.searchParams.set('latitude', String(latitude))
    weatherUrl.searchParams.set('longitude', String(longitude))
    weatherUrl.searchParams.set('current', 'temperature_2m,wind_speed_10m,relative_humidity_2m,weather_code')

    const weatherRes = await fetch(weatherUrl)
    const weatherData = await weatherRes.json()

    return {
      city: name,
      country,
      ...weatherData.current
    }
  }
})
