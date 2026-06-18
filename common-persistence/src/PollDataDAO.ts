import { PollData } from '@conductor/common';

export interface PollDataDAO {
  updateLastPollData(taskDefName: string, domain: string, workerId: string): Promise<void>;
  getPollData(taskDefName: string, domain: string): Promise<PollData | undefined>;
  getPollDataForTask(taskDefName: string): Promise<PollData[]>;
  getAllPollData(): Promise<PollData[]>;
}
