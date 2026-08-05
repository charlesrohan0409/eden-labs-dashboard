// Month grid showing which days have scheduled or published posts.
export default function MiniCalendar({ posts, clientId }) {
  const now = new Date();
  const year = now.getFullYear(), month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const todayDate = now.getDate();

  const postsByDay = {};
  posts.filter((p) => p.clientId === clientId).forEach((p) => {
    const d = new Date(p.date);
    if (d.getFullYear() === year && d.getMonth() === month) {
      const day = d.getDate();
      (postsByDay[day] = postsByDay[day] || []).push(p);
    }
  });

  const cells = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];

  return (
    <div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] text-stone-400 mb-1.5 font-medium">
        {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => <div key={i}>{d}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((day, i) => (
          <div
            key={i}
            className={`aspect-square rounded-lg text-[10px] p-1 overflow-hidden ${
              !day ? "" : day === todayDate ? "bg-emerald-50 border border-emerald-200" : "border border-stone-100"
            }`}
          >
            {day && (
              <>
                <div className={day === todayDate ? "text-emerald-800 font-semibold" : "text-stone-500"}>{day}</div>
                <div className="flex gap-0.5 flex-wrap mt-0.5">
                  {(postsByDay[day] || []).map((p) => (
                    <span
                      key={p.id}
                      title={p.content}
                      className={`w-1.5 h-1.5 rounded-full ${p.status === "published" ? "bg-emerald-600" : "bg-teal-400"}`}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      <div className="flex gap-3 text-[10px] text-stone-400 mt-3">
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-600 inline-block" /> Published</span>
        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-teal-400 inline-block" /> Scheduled</span>
      </div>
    </div>
  );
}
