export class PostgresBaseDAO {
  constructor() {}
}
export class MySQLBaseDAO {
  constructor() {}
}
export class CassandraBaseDAO {
  constructor() {}
}
export class CassandraProperties {
  constructor() {}
  setKeyspace(k) {}
  getKeyspace() { return 'test'; }

}
export class NonTransientException extends Error {
  constructor(msg) { super(msg); }
}
export class Monitors {
  static recordSchedulerPollFault() {}
  static recordUpdateSchedule(n) {}
  static recordUpdateScheduleFailed(n) {}
  static recordPauseSchedule(n) {}
  static recordPauseScheduleFailed(n) {}
  static recordResumeSchedule(n) {}
  static recordResumeScheduleFailed(n) {}
  static recordDeleteSchedule(n) {}
  static recordDeleteScheduleFailed(n) {}
}
export class StartWorkflowRequest {
  constructor() {}
}
export class SearchResult {
  constructor() {
    this.results = [];
  }
}
export class BulkResponse {
  constructor() {}
  appendFailedResponse(name, msg) {}
  getBulkSuccessfulResults() { return []; }
  getBulkErrorResults() { return {}; }

  appendSuccessResponse(name) {}
}

export class WorkflowScheduleExecutionModel {}
export class WorkflowScheduleModel {}

export class SchedulerSearchQuery { static parse() { return { hasScheduleNames: () => false }; } }
