import { CoreActionItem, CoreMetadata } from '../schemas/report-ir.schema.js';

export interface KglvsWorkItem {
  id?: string;
  title: string;
  description: string;
  sourceDocumentNumber: string | null;
  sourceDocumentTitle: string;
  assignedDepartment: string;
  leadAssignee?: string;
  deadline?: string;
  expectedOutput: string;
  priority: 'HIGH' | 'MEDIUM' | 'NORMAL';
  status: 'CAN_XU_LY'; // Theo quy chuẩn bảng 10 trong KGLVS
  createdAt: string;
}

export class TaskDispatcherService {
  /**
   * Chuyển đổi danh sách nhiệm vụ bóc tách từ báo cáo thành các đầu việc chuẩn của KGLVS
   */
  createKglvsWorkItems(
    tasks: CoreActionItem[],
    metadata: CoreMetadata,
    selectedIndices?: number[]
  ): KglvsWorkItem[] {
    const selectedTasks = selectedIndices && selectedIndices.length > 0
      ? tasks.filter((_, idx) => selectedIndices.includes(idx))
      : tasks;

    return selectedTasks.map((t, idx) => ({
      id: `TASK-${Date.now()}-${idx + 1}`,
      title: t.action_title,
      description: `Nhiệm vụ phát sinh từ ${metadata.document_title} (${metadata.document_number || 'Chưa ghi số'}).\nTrang trích xuất: ${t.page_ref}`,
      sourceDocumentNumber: metadata.document_number,
      sourceDocumentTitle: metadata.document_title,
      assignedDepartment: t.owner_department || 'Ban chuyên môn',
      deadline: t.deadline || undefined,
      expectedOutput: t.expected_output || 'Báo cáo kết quả thực hiện',
      priority: t.priority,
      status: 'CAN_XU_LY',
      createdAt: new Date().toISOString()
    }));
  }
}
