/**
 * Chuẩn hóa tên tệp tải về sang tiếng Việt hành chính rõ ràng, đọc được cho lãnh đạo,
 * bảo vệ tuyệt đối dấu tiếng Việt và chỉ loại bỏ các ký tự cấm của hệ điều hành.
 */
export function formatExecutiveDownloadFilename(rawTitle: string | undefined, extension: string = 'docx'): string {
  let title = String(rawTitle || 'Báo Cáo Điều Hành Chiến Lược').trim();

  // 1. Loại bỏ các phần mở rộng cũ nếu có trong title (.pdf, .docx, .doc, .xlsx, .json)
  title = title.replace(/\.(pdf|docx|doc|xlsx|txt|json)$/i, '');

  // 2. Làm sạch các ký tự đặc biệt / markdown / tag kỹ thuật
  title = title.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '');

  // 3. Thay thế các ký tự cấm của hệ điều hành (\ / : * ? " < > |) bằng dấu gạch ngang
  title = title.replace(/[\\/:*?"<>|]+/g, ' - ');

  // 4. Thu gọn khoảng trắng và dấu gạch nối thừa
  title = title.replace(/\s+/g, ' ').replace(/\s*-\s*-\s*/g, ' - ').trim();

  if (!title) {
    title = 'Báo Cáo Điều Hành Chiến Lược';
  }

  // 5. Thêm hậu tố nhận diện Báo Cáo Điều Hành Chiến Lược nếu chưa có
  const lower = title.toLowerCase();
  if (!lower.includes('điều hành') && !lower.includes('dieu hanh') && !lower.includes('chiến lược') && !lower.includes('chien luoc')) {
    title = `${title} - Điều Hành Chiến Lược`;
  }

  // 6. Giới hạn độ dài tối đa 120 ký tự để tránh vượt giới hạn MAX_PATH (260 ký tự) trên Windows
  if (title.length > 120) {
    title = title.substring(0, 120).trim();
  }

  return `${title}.${extension}`;
}

export function formatContentDispositionHeader(filename: string): string {
  // Tạo ASCII fallback an toàn bằng cách bỏ dấu Unicode
  const asciiFallback = filename
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^a-zA-Z0-9._\- ]/g, '_')
    .replace(/\s+/g, '_');

  // RFC 5987 / RFC 6266 format hỗ trợ 100% tiếng Việt UTF-8 chuẩn trên trình duyệt
  return `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
