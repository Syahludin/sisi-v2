import Dialog from '../../components/Dialog.jsx';

const teksKva = (v) => new Intl.NumberFormat('id-ID').format(v);

/** Daftar gardu aktif satu penyulang beserta kapasitasnya (klik jumlah gardu di kartu). daftar = { nama, gardu: [{ no, kva, alamat }] } | null. */
export function RincianGardu({ daftar, onTutup }) {
  const gardu = daftar?.gardu || [];
  const total = gardu.reduce((n, g) => n + g.kva, 0);
  return (
    <Dialog buka={!!daftar} judul={daftar ? 'Gardu ' + daftar.nama : ''} sub={`${gardu.length} gardu aktif · total ${teksKva(total)} kVA (db_Gardu)`} onTutup={onTutup} lebar="min(640px, 96vw)">
      <div className="das-gulir das-gulir--tinggi">
        <table className="das-tabel das-daftar">
          <thead><tr><th>No Gardu</th><th>Alamat</th><th className="das-km">Kapasitas (kVA)</th></tr></thead>
          <tbody>
            {gardu.map((g) => (
              <tr key={g.no}><th className="das-desc">{g.no}</th><td>{g.alamat || '-'}</td><td className="das-km">{g.kva ? teksKva(g.kva) : '-'}</td></tr>
            ))}
          </tbody>
          <tfoot><tr><th>Total</th><td /><td className="das-km das-total">{teksKva(total)}</td></tr></tfoot>
        </table>
      </div>
      <div className="k-bawah"><span className="k-spasi" /><button type="button" className="k-tombol k-tombol--garis" onClick={onTutup}>Tutup</button></div>
    </Dialog>
  );
}
