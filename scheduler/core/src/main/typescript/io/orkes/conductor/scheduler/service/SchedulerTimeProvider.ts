/**
 * Service to provide scheduler time
 */
export class SchedulerTimeProvider {

    // Simulating ZonedDateTime and ZoneId with Date and timezone string
    public getUtcTime(zoneId: string): Date {
        return new Date();
    }
}
